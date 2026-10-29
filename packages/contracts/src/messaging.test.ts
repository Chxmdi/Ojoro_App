import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  activityChatSubscription,
  activityLiveSubscription,
  crewChatSubscription,
  groupNotifications,
  idempotentRpcs,
  liveClockSeconds,
  liveFreshnessSeconds,
  messagingErrorCodes,
  messagingIdempotentRpcs,
  messagingRpcs,
  messagingVolatileReadRpcs,
  notificationsSubscription,
  ojoroErrorCodes,
  reactionWords,
  toOjoroError,
} from './index';

const migrationsDir = new URL('../../../supabase/migrations/', import.meta.url);
const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(new URL(f, migrationsDir), 'utf8'))
  .join('\n');

describe('messaging contract drift (CI-safe, no database needed)', () => {
  it('every Step 4 RPC is defined in a migration', () => {
    for (const name of messagingRpcs) {
      expect(migrations, name).toMatch(new RegExp(`function public\\.${name}\\(`));
    }
  });

  it('idempotent Step 4 RPCs take p_idempotency_key and are listed with the others', () => {
    for (const name of messagingIdempotentRpcs) {
      const start = migrations.indexOf(`function public.${name}(`);
      const signature = migrations.slice(start, migrations.indexOf(')\nreturns', start));
      expect(signature, name).toContain('p_idempotency_key uuid');
      expect(idempotentRpcs as readonly string[]).toContain(name);
    }
  });

  it('volatile reads are volatile', () => {
    for (const name of messagingVolatileReadRpcs) {
      const start = migrations.lastIndexOf(`function public.${name}(`);
      const header = migrations.slice(start, migrations.indexOf('as $$', start));
      expect(header, name).toMatch(/\bvolatile\b/);
    }
  });

  it('Step 4 error codes are raised and mapped', () => {
    for (const code of messagingErrorCodes) {
      expect(migrations).toContain(`private.fail('${code}'`);
      expect(ojoroErrorCodes as readonly string[]).toContain(code);
      expect(toOjoroError({ code: 'P0001', message: code }).kind).toBe('ojoro');
    }
  });

  it('every realtime table is in the publication', () => {
    const tables = new Set(
      [
        notificationsSubscription('x'),
        crewChatSubscription('x'),
        activityLiveSubscription('x'),
        activityChatSubscription('x'),
      ].flatMap((s) => s.changes.map((c) => c.table)),
    );
    const publication = migrations.slice(
      migrations.indexOf('alter publication supabase_realtime add table'),
    );
    for (const table of tables) expect(publication, table).toContain(`public.${table}`);
  });

  it('reaction words match the enum', () => {
    expect(migrations).toContain(
      "create type public.reaction_word as enum ('lets_go', 'respect', 'hold_that', 'run_it_back');",
    );
    expect(reactionWords.map((r) => r.value)).toEqual([
      'lets_go',
      'respect',
      'hold_that',
      'run_it_back',
    ]);
  });
});

describe('subscriptions', () => {
  it('filter by the right column', () => {
    expect(notificationsSubscription('u1').changes[0]?.filter).toBe('recipient_id=eq.u1');
    expect(crewChatSubscription('c1').changes.every((c) => c.filter === 'crew_id=eq.c1')).toBe(
      true,
    );
    expect(activityLiveSubscription('a1').changes[0]?.filter).toBe('id=eq.a1');
    expect(activityChatSubscription('a1').channel).toBe('activity-chat:a1');
  });
});

describe('groupNotifications', () => {
  it('keeps order within sections', () => {
    const rows = [
      { id: 1, section: 'needs_you' },
      { id: 2, section: 'today' },
      { id: 3, section: 'needs_you' },
      { id: 4, section: 'earlier' },
    ];
    const g = groupNotifications(rows);
    expect(g.needs_you.map((r) => r.id)).toEqual([1, 3]);
    expect(g.today.map((r) => r.id)).toEqual([2]);
    expect(g.earlier.map((r) => r.id)).toEqual([4]);
  });
});

describe('live clock and freshness', () => {
  const state = {
    server_now: '2026-10-29T20:00:00Z',
    live_at: '2026-10-29T19:25:48Z',
    last_update_at: '2026-10-29T19:59:40Z',
  };
  const received = new Date('2026-10-29T19:59:00Z'); // device clock 1 min behind

  it('counts from the server clock', () => {
    expect(liveFreshnessSeconds(state, received, received)).toBe(20);
    expect(liveFreshnessSeconds(state, received, new Date('2026-10-29T19:59:10Z'))).toBe(30);
    expect(liveClockSeconds(state, received, received)).toBe(34 * 60 + 12);
  });

  it('is null without a timestamp', () => {
    expect(liveFreshnessSeconds({ ...state, last_update_at: null }, received)).toBeNull();
    expect(liveClockSeconds({ ...state, live_at: null }, received)).toBeNull();
  });
});
