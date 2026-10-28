import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  Constants,
  activitySubscription,
  checkInWindowState,
  effectiveActivityStatus,
  effectivePlanStatus,
  idempotentRpcs,
  invitesSubscription,
  isOjoroErrorCode,
  isRetryable,
  ojoroErrorCodes,
  planSubscription,
  slice01Rpcs,
  toOjoroError,
} from './index.js';

const migrationsDir = new URL('../../../supabase/migrations/', import.meta.url);
const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(new URL(f, migrationsDir), 'utf8'))
  .join('\n');

describe('contract drift (CI-safe, no database needed)', () => {
  it('lists every error code the migrations raise, and only those', () => {
    const raised = new Set(
      [...migrations.matchAll(/private\.fail\('([a-z_]+)'/g)].map((m) => m[1] as string),
    );
    expect([...raised].sort()).toEqual([...ojoroErrorCodes].sort());
  });

  it('every contract RPC is defined in a migration', () => {
    for (const name of slice01Rpcs) {
      expect(migrations, name).toMatch(new RegExp(`function public\\.${name}\\(`));
    }
  });

  it('idempotent RPCs take p_idempotency_key', () => {
    for (const name of idempotentRpcs) {
      const start = migrations.indexOf(`function public.${name}(`);
      const signature = migrations.slice(start, migrations.indexOf(')\nreturns', start));
      expect(signature, name).toContain('p_idempotency_key uuid');
    }
  });

  it('generated enum values match the migrations', () => {
    expect(Constants.public.Enums.plan_status).toEqual([
      'forming',
      'game_on',
      'expired',
      'cancelled',
    ]);
    expect(migrations).toContain(
      "create type public.plan_status as enum ('forming', 'game_on', 'expired', 'cancelled');",
    );
  });
});

describe('toOjoroError', () => {
  it('maps a raised code', () => {
    expect(toOjoroError({ code: 'P0001', message: 'plan_full', details: 'abc' })).toEqual({
      kind: 'ojoro',
      code: 'plan_full',
      detail: 'abc',
    });
    expect(toOjoroError({ code: 'P0001', message: 'too_far', detail: '200' })).toEqual({
      kind: 'ojoro',
      code: 'too_far',
      detail: '200',
    });
    expect(toOjoroError({ code: 'P0001', message: 'plan_expired', details: '' }).detail).toBeNull();
  });

  it('maps permission errors', () => {
    expect(toOjoroError({ code: '42501', message: 'permission denied' }).kind).toBe('permission');
    expect(toOjoroError({ code: 'PGRST301', message: 'JWT expired' }).code).toBe(
      'permission_denied',
    );
  });

  it('maps network failures and marks them retryable', () => {
    const offline = toOjoroError(new TypeError('Network request failed'));
    expect(offline.kind).toBe('network');
    expect(isRetryable(offline)).toBe(true);
    expect(toOjoroError({ message: 'Failed to fetch' }).kind).toBe('network');
    expect(toOjoroError({ name: 'AbortError', message: 'aborted' }).kind).toBe('network');
  });

  it('falls back to unknown', () => {
    expect(toOjoroError({ code: 'P0001', message: 'something_new' })).toEqual({
      kind: 'unknown',
      code: 'unknown',
      detail: 'something_new',
    });
    expect(toOjoroError('boom')).toEqual({ kind: 'unknown', code: 'unknown', detail: 'boom' });
    expect(toOjoroError(null).detail).toBeNull();
    expect(toOjoroError({}).kind).toBe('unknown');
    expect(isRetryable(toOjoroError({}))).toBe(false);
  });

  it('recognizes codes', () => {
    expect(isOjoroErrorCode('plan_full')).toBe(true);
    expect(isOjoroErrorCode('nope')).toBe(false);
    expect(isOjoroErrorCode(3)).toBe(false);
  });
});

describe('time rules', () => {
  const now = new Date('2026-10-28T23:00:00Z');

  it('plan expires at its deadline', () => {
    expect(
      effectivePlanStatus({ status: 'forming', deadline_at: '2026-10-28T22:59:59Z' }, now),
    ).toBe('expired');
    expect(
      effectivePlanStatus({ status: 'forming', deadline_at: '2026-10-28T23:30:00Z' }, now),
    ).toBe('forming');
    expect(
      effectivePlanStatus({ status: 'game_on', deadline_at: '2026-10-28T20:00:00Z' }, now),
    ).toBe('game_on');
    expect(effectivePlanStatus({ status: 'forming', deadline_at: '2999-01-01T00:00:00Z' })).toBe(
      'forming',
    );
  });

  const base = {
    status: 'confirmed' as const,
    starts_at: '2026-10-28T23:30:00Z',
    ends_at: '2026-10-29T01:00:00Z',
    live_at: null,
    ended_at: null,
    after_closes_at: '2026-10-30T01:00:00Z',
  };

  it('activity moves confirmed → live → after → complete', () => {
    expect(effectiveActivityStatus(base, now)).toBe('confirmed');
    expect(effectiveActivityStatus({ ...base, live_at: '2026-10-28T22:55:00Z' }, now)).toBe('live');
    expect(effectiveActivityStatus(base, new Date('2026-10-28T23:45:00Z'))).toBe('live');
    expect(effectiveActivityStatus(base, new Date('2026-10-29T02:00:00Z'))).toBe('after');
    expect(effectiveActivityStatus({ ...base, ended_at: '2026-10-28T22:00:00Z' }, now)).toBe(
      'after',
    );
    expect(effectiveActivityStatus(base, new Date('2026-10-30T01:00:00Z'))).toBe('complete');
    expect(effectiveActivityStatus({ ...base, status: 'complete' }, now)).toBe('complete');
    expect(effectiveActivityStatus({ ...base, status: 'cancelled' }, now)).toBe('cancelled');
    expect(
      effectiveActivityStatus({
        ...base,
        after_closes_at: '2999-01-01T00:00:00Z',
        starts_at: '2999-01-01T00:00:00Z',
        ends_at: '2999-01-01T01:00:00Z',
      }),
    ).toBe('confirmed');
  });

  it('check-in window', () => {
    const w = {
      check_in_opens_at: '2026-10-28T23:00:00Z',
      check_in_closes_at: '2026-10-29T01:00:00Z',
    };
    expect(checkInWindowState(w, new Date('2026-10-28T22:59:00Z'))).toBe('early');
    expect(checkInWindowState(w, now)).toBe('open');
    expect(checkInWindowState(w, new Date('2026-10-29T01:00:00Z'))).toBe('closed');
    expect(
      checkInWindowState({
        check_in_opens_at: '2999-01-01T00:00:00Z',
        check_in_closes_at: '2999-01-02T00:00:00Z',
      }),
    ).toBe('early');
  });
});

describe('realtime subscriptions', () => {
  it('plan channel filters by plan id', () => {
    const sub = planSubscription('p1');
    expect(sub.channel).toBe('plan:p1');
    expect(sub.changes.map((c) => `${c.table}:${c.filter}`)).toEqual([
      'plans:id=eq.p1',
      'plan_members:plan_id=eq.p1',
      'plan_time_options:plan_id=eq.p1',
    ]);
  });

  it('activity channel filters by activity id', () => {
    const sub = activitySubscription('a1');
    expect(sub.channel).toBe('activity:a1');
    expect(sub.changes[0]).toEqual({
      event: 'UPDATE',
      schema: 'public',
      table: 'activities',
      filter: 'id=eq.a1',
    });
    expect(sub.changes.slice(1).every((c) => c.filter === 'activity_id=eq.a1')).toBe(true);
  });

  it('invites channel filters by invitee', () => {
    expect(invitesSubscription('u1').changes[0]?.filter).toBe('invitee_id=eq.u1');
  });

  it('every realtime table is in the publication', () => {
    const tables = new Set(
      [planSubscription('x'), activitySubscription('x'), invitesSubscription('x')].flatMap((s) =>
        s.changes.map((c) => c.table),
      ),
    );
    const publication = migrations.slice(
      migrations.indexOf('alter publication supabase_realtime add table'),
    );
    for (const table of tables) expect(publication, table).toContain(`public.${table}`);
  });
});
