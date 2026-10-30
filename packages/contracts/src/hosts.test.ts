import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  canUndo,
  daysLabel,
  formatPrice,
  hostErrorCodes,
  hostIdempotentRpcs,
  hostProgramSubscription,
  hostRpcs,
  hostSessionSubscription,
  idempotentRpcs,
  isoDayShort,
  last12Label,
  LEVEL_LABEL,
  ojoroErrorCodes,
  REFUND_WINDOW_LABEL,
  SERIES_SETTING_KEYS,
  seriesChanges,
  toOjoroError,
  waitlistWords,
  weekBadge,
  HOST_PUSHES_PER_SESSION,
  HOST_UNDO_MINUTES,
  HOST_EXPERIENCED_GAMES,
} from './index';

const migrationsDir = new URL('../../../supabase/migrations/', import.meta.url);
const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(new URL(f, migrationsDir), 'utf8'))
  .join('\n');

describe('host contract drift (CI-safe, no database needed)', () => {
  it('every Host OS core RPC is defined in a migration', () => {
    for (const name of hostRpcs) {
      expect(migrations, name).toMatch(new RegExp(`function public\\.${name}\\(`));
    }
  });

  it('idempotent host RPCs take p_idempotency_key and are listed with the others', () => {
    for (const name of hostIdempotentRpcs) {
      const start = migrations.lastIndexOf(`function public.${name}(`);
      const signature = migrations.slice(start, migrations.indexOf('\nreturns', start));
      expect(signature, name).toContain('p_idempotency_key uuid');
      expect(idempotentRpcs as readonly string[]).toContain(name);
    }
  });

  it('host error codes are raised and mapped', () => {
    for (const code of hostErrorCodes) {
      expect(migrations).toContain(`private.fail('${code}'`);
      expect(ojoroErrorCodes as readonly string[]).toContain(code);
      expect(toOjoroError({ code: 'P0001', message: code }).kind).toBe('ojoro');
    }
  });

  it('the settings keys match the server list', () => {
    for (const key of SERIES_SETTING_KEYS) {
      expect(migrations).toContain(`'${key}'`);
    }
  });

  it('the limits match the server', () => {
    expect(migrations).toContain(
      `host_pushes_per_session()\nreturns integer language sql immutable set search_path = '' as $$ select ${HOST_PUSHES_PER_SESSION} $$`,
    );
    expect(migrations).toContain(
      `host_undo_minutes()\nreturns integer language sql immutable set search_path = '' as $$ select ${HOST_UNDO_MINUTES} $$`,
    );
    expect(migrations).toContain(
      `host_experienced_games()\nreturns integer language sql immutable set search_path = '' as $$ select ${HOST_EXPERIENCED_GAMES} $$`,
    );
  });

  it('every realtime table is in the publication', () => {
    const tables = new Set(
      [hostProgramSubscription('p'), hostSessionSubscription('s', 'a')].flatMap((s) =>
        s.changes.map((c) => c.table),
      ),
    );
    for (const table of tables) {
      expect(migrations, table).toMatch(new RegExp(`public\\.${table}[,;\\s]`));
    }
  });
});

describe('host helpers', () => {
  it('sends only what changed', () => {
    const loaded = {
      name: 'Tuesday 7-a-side',
      start_time: '19:30:00',
      repeat_days: [2],
      price_cents: 800,
      until_on: null,
    };
    expect(
      seriesChanges(loaded, {
        name: 'Tuesday 7-a-side',
        start_time: '19:30',
        repeat_days: [2, 2],
        price_cents: 900,
        until_on: null,
      }),
    ).toEqual({ price_cents: 900 });
    expect(seriesChanges(loaded, { repeat_days: [4, 2] })).toEqual({ repeat_days: [4, 2] });
    expect(seriesChanges(loaded, { kit_note: 'Bibs' })).toEqual({ kit_note: 'Bibs' });
    expect(seriesChanges(loaded, {})).toEqual({});
  });

  it('formats prices in words', () => {
    expect(formatPrice(0)).toBe('Free');
    expect(formatPrice(800)).toBe('$8');
    expect(formatPrice(850, 'CAD')).toBe('$8.50');
    expect(formatPrice(1200, 'EUR')).toBe('€12');
    expect(formatPrice(500, 'GBP')).toBe('£5');
  });

  it('names days', () => {
    expect(isoDayShort(1)).toBe('Mon');
    expect(isoDayShort(7)).toBe('Sun');
    expect(isoDayShort(9)).toBe('Tue');
    expect(daysLabel([2, 4])).toBe('Tue · Thu');
    expect(daysLabel([])).toBe('');
  });

  it('labels levels and refund windows', () => {
    expect(LEVEL_LABEL.mixed).toBe('Mixed');
    expect(REFUND_WINDOW_LABEL.hours_12).toBe('12 h before');
  });

  it('badges the week in words', () => {
    const base = {
      kind: 'session',
      status: 'scheduled',
      capacity: 14,
      in_count: 14,
      asking_count: 0,
    };
    expect(weekBadge(base)).toBe('FULL');
    expect(weekBadge({ ...base, in_count: 8, capacity: 10 })).toBe('8 / 10');
    expect(weekBadge({ ...base, in_count: 9, capacity: 12, asking_count: 2 })).toBe('2 ASKING');
    expect(weekBadge({ ...base, status: 'skipped' })).toBe('SKIPPED');
    expect(weekBadge({ ...base, kind: 'league' })).toBe('LEAGUE');
  });

  it('words for last 12, the waitlist and undo', () => {
    expect(last12Label(9, 12)).toBe('9 of the last 12');
    expect(waitlistWords(null)).toBeNull();
    expect(waitlistWords(1)).toBe("You're next");
    expect(waitlistWords(3)).toBe('2 ahead of you');
    const now = new Date('2026-10-30T12:00:00Z');
    expect(canUndo('2026-10-30T12:05:00Z', now)).toBe(true);
    expect(canUndo('2026-10-30T11:55:00Z', now)).toBe(false);
    expect(canUndo(null, now)).toBe(false);
  });

  it('builds realtime subscriptions', () => {
    expect(hostProgramSubscription('p1').channel).toBe('host-program:p1');
    expect(hostSessionSubscription('s1', 'a1').changes).toContainEqual({
      event: '*',
      schema: 'public',
      table: 'attendance',
      filter: 'activity_id=eq.a1',
    });
  });
});
