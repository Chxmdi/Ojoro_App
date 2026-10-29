import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  callOutSubscription,
  callOutsSubscription,
  challengeCountdown,
  challengeEventSubscription,
  competitionErrorCodes,
  competitionIdempotentRpcs,
  competitionRpcs,
  competitionToggleRpcs,
  crowdOutcome,
  formatChallengeValue,
  formatMargin,
  formCells,
  idempotentRpcs,
  ojoroErrorCodes,
  screenForStage,
  situationForStage,
  toOjoroError,
  type ChallengeStage,
} from './index';

const migrationsDir = new URL('../../../supabase/migrations/', import.meta.url);
const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(new URL(f, migrationsDir), 'utf8'))
  .join('\n');

describe('competition contract drift (CI-safe, no database needed)', () => {
  it('every Step 5 RPC is defined in a migration', () => {
    for (const name of [...competitionRpcs, ...competitionToggleRpcs]) {
      expect(migrations, name).toMatch(new RegExp(`function public\\.${name}\\(`));
    }
  });

  it('idempotent Step 5 RPCs take p_idempotency_key and are listed with the others', () => {
    for (const name of competitionIdempotentRpcs) {
      const start = migrations.lastIndexOf(`function public.${name}(`);
      const signature = migrations.slice(start, migrations.indexOf(')\nreturns', start));
      expect(signature, name).toContain('p_idempotency_key uuid');
      expect(idempotentRpcs as readonly string[]).toContain(name);
    }
  });

  it('Step 5 error codes are raised and mapped', () => {
    for (const code of competitionErrorCodes) {
      expect(migrations).toContain(`private.fail('${code}'`);
      expect(ojoroErrorCodes as readonly string[]).toContain(code);
      expect(toOjoroError({ code: 'P0001', message: code }).kind).toBe('ojoro');
    }
  });

  it('every realtime table is in the publication', () => {
    const tables = new Set(
      [
        challengeEventSubscription('x'),
        callOutSubscription('x'),
        callOutsSubscription('x'),
      ].flatMap((s) => s.changes.map((c) => c.table)),
    );
    const publications = migrations
      .split('alter publication supabase_realtime add table')
      .slice(1)
      .map((p) => p.slice(0, p.indexOf(';')))
      .join('\n');
    for (const table of tables) expect(publications, table).toContain(`public.${table}`);
  });

  it('stages match the enum', () => {
    expect(migrations).toContain(
      "'accepted', 'days', 'today', 'soon', 'live', 'verifying', 'disputed', 'complete', 'cancelled'",
    );
  });

  it('no money anywhere in the competition schema', () => {
    const competition = readdirSync(migrationsDir)
      .filter((f) => f.includes('competition'))
      .map((f) => readFileSync(new URL(f, migrationsDir), 'utf8'))
      .join('\n');
    expect(competition).not.toMatch(
      /\b(stake|odds|payout|wager|cents|currency)\w*\s+(numeric|integer|text)/i,
    );
  });
});

describe('stages', () => {
  const all: ChallengeStage[] = [
    'accepted',
    'days',
    'today',
    'soon',
    'live',
    'verifying',
    'disputed',
    'complete',
    'cancelled',
  ];

  it('map to situations, moving forward', () => {
    expect(all.map(situationForStage)).toEqual([
      'forming',
      'forming',
      'confirmed',
      'confirmed',
      'live',
      'after',
      'after',
      'after',
      'calm',
    ]);
  });

  it('map to screens', () => {
    expect(all.map(screenForStage)).toEqual([
      'EventBuildup',
      'EventBuildup',
      'EventToday',
      'EventToday',
      'EventLive',
      'Verifying',
      'Verifying',
      'Result',
      'EventBuildup',
    ]);
  });
});

describe('countdown', () => {
  const state = { server_now: '2026-10-29T12:00:00Z', starts_at: '2026-11-02T02:20:30Z' };
  const received = new Date('2026-10-29T11:59:00Z'); // device clock 1 min behind

  it('counts on the server clock', () => {
    expect(challengeCountdown(state, received, received)).toEqual({
      days: 3,
      hours: 14,
      minutes: 20,
      seconds: 30,
    });
    expect(challengeCountdown(state, received, new Date('2026-10-29T12:00:00Z'))?.minutes).toBe(19);
  });

  it('is null once started', () => {
    expect(
      challengeCountdown({ ...state, starts_at: '2026-10-29T11:00:00Z' }, received, received),
    ).toBeNull();
  });
});

describe('values', () => {
  it('formats by scoring', () => {
    expect(formatChallengeValue(1368, 'time')).toBe('22:48');
    expect(formatChallengeValue(3723, 'time')).toBe('1:02:03');
    expect(formatChallengeValue(3.4, 'distance')).toBe('3.4 km');
    expect(formatChallengeValue(2, 'rounds', 'rounds')).toBe('2 rounds');
    expect(formatChallengeValue(3, 'score')).toBe('3');
    expect(formatChallengeValue(null, 'time')).toBeNull();
  });

  it('formats margins', () => {
    expect(formatMargin(43, 'time')).toBe('43 seconds');
    expect(formatMargin(1, 'time')).toBe('1 second');
    expect(formatMargin(62, 'time')).toBe('1:02');
    expect(formatMargin(0.3, 'distance')).toBe('0.3 km');
    expect(formatMargin(2, 'score')).toBe('2');
  });

  it('builds form cells', () => {
    expect(formCells(['a', 'b', 'd'], 'Chimdi', 'Marcus')).toEqual([
      { side: 'a', label: 'C' },
      { side: 'b', label: 'M' },
      { side: 'd', label: '=' },
    ]);
    expect(formCells(['a', 'b'], '', '')).toEqual([
      { side: 'a', label: 'A' },
      { side: 'b', label: 'B' },
    ]);
  });

  it('reads the crowd outcome', () => {
    expect(crowdOutcome(true)).toBe('called_it');
    expect(crowdOutcome(false)).toBe('got_it_wrong');
    expect(crowdOutcome(null)).toBeNull();
  });
});

describe('subscriptions', () => {
  it('filter by the right column', () => {
    const ev = challengeEventSubscription('e1');
    expect(ev.channel).toBe('challenge:e1');
    expect(ev.changes[0]?.filter).toBe('id=eq.e1');
    expect(ev.changes.slice(1).every((c) => c.filter === 'event_id=eq.e1')).toBe(true);
    expect(callOutSubscription('c1').changes[0]?.filter).toBe('id=eq.c1');
    expect(callOutsSubscription('u1').changes.map((c) => c.filter)).toEqual([
      'opponent_id=eq.u1',
      'challenger_id=eq.u1',
    ]);
  });
});
