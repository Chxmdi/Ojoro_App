import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  clanSubscription,
  clashScore,
  clashSides,
  clashSubscription,
  communitiesErrorCodes,
  communitiesIdempotentRpcs,
  communitiesRpcs,
  crewHomeSubscription,
  formatClashValue,
  formatMissionAmount,
  idempotentRpcs,
  missionFraction,
  momentumHeadline,
  ojoroErrorCodes,
  situationForClashStage,
  toOjoroError,
  CLAN_RUN_CAPACITY_MAX,
  CLAN_RUN_CHECK_IN_RADIUS_M,
  CREW_RITUALS_MAX,
  CLAN_RITUALS_MAX,
  type ClashStage,
} from './index';

const migrationsDir = new URL('../../../supabase/migrations/', import.meta.url);
const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(new URL(f, migrationsDir), 'utf8'))
  .join('\n');

describe('communities contract drift (CI-safe, no database needed)', () => {
  it('every Step 6 communities RPC is defined in a migration', () => {
    for (const name of communitiesRpcs) {
      expect(migrations, name).toMatch(new RegExp(`function public\\.${name}\\(`));
    }
  });

  it('idempotent RPCs take p_idempotency_key and are listed with the others', () => {
    for (const name of communitiesIdempotentRpcs) {
      const start = migrations.lastIndexOf(`create or replace function public.${name}(`);
      const signature = migrations.slice(start, migrations.indexOf(')\nreturns', start));
      expect(signature, name).toContain('p_idempotency_key uuid');
      expect(idempotentRpcs as readonly string[]).toContain(name);
    }
  });

  it('error codes are raised and mapped', () => {
    for (const code of communitiesErrorCodes) {
      expect(migrations, code).toContain(`'${code}'`);
      expect(ojoroErrorCodes as readonly string[]).toContain(code);
      expect(toOjoroError({ code: 'P0001', message: code }).kind).toBe('ojoro');
    }
  });

  it('every realtime table is in the publication', () => {
    const tables = new Set(
      [crewHomeSubscription('x'), clanSubscription('x'), clashSubscription('x')].flatMap((s) =>
        s.changes.map((c) => c.table),
      ),
    );
    const publications = migrations
      .split('alter publication supabase_realtime add table')
      .slice(1)
      .map((p) => p.slice(0, p.indexOf(';')))
      .join('\n');
    for (const table of tables) expect(publications, table).toContain(`public.${table}`);
  });

  it('limits match the database', () => {
    expect(migrations).toContain(`capacity between 2 and ${CLAN_RUN_CAPACITY_MAX}`);
    expect(migrations).toContain(`if v_d > ${CLAN_RUN_CHECK_IN_RADIUS_M} then`);
    expect(migrations).toContain(`perform private.fail('ritual_limit', '${CREW_RITUALS_MAX}')`);
    expect(migrations).toContain(`perform private.fail('ritual_limit', '${CLAN_RITUALS_MAX}')`);
  });

  it('no money anywhere in the communities schema', () => {
    const communities = readdirSync(migrationsDir)
      .filter((f) => f.includes('communities'))
      .map((f) => readFileSync(new URL(f, migrationsDir), 'utf8'))
      .join('\n');
    expect(communities).not.toMatch(
      /\b(stake|odds|payout|wager|prize|cents|currency)\w*\s+(numeric|integer|text)/i,
    );
  });

  it('report reaches crews, clans, club runs and Clashes', () => {
    for (const kind of ['crew', 'clan', 'clan_run', 'clash']) {
      expect(migrations).toContain(`add value if not exists '${kind}'`);
      expect(migrations).toContain(`when '${kind}' then`);
    }
  });
});

describe('clash stages', () => {
  const all: ClashStage[] = ['proposed', 'upcoming', 'live', 'complete', 'declined', 'cancelled'];

  it('map to situations, moving forward', () => {
    expect(all.map(situationForClashStage)).toEqual([
      'forming',
      'confirmed',
      'live',
      'after',
      'calm',
      'calm',
    ]);
  });
});

describe('momentum', () => {
  it('states the streak in words, never as a loss', () => {
    expect(momentumHeadline('on_rhythm', 6)).toBe('6 WEEK STREAK');
    expect(momentumHeadline('on_rhythm', 1)).toBe('1 WEEK STREAK');
    expect(momentumHeadline('comeback', 0)).toBe('COMEBACK WEEK');
    expect(momentumHeadline('starting', 0)).toBe('FIRST WEEK');
    expect(momentumHeadline('on_rhythm', 0)).toBe('FIRST WEEK');
  });
});

describe('mission', () => {
  it('is a fraction from 0 to 1', () => {
    expect(missionFraction(1240, 2000)).toBeCloseTo(0.62);
    expect(missionFraction(2500, 2000)).toBe(1);
    expect(missionFraction(0, 2000)).toBe(0);
    expect(missionFraction(5, 0)).toBe(0);
  });

  it('formats amounts with grouping', () => {
    expect(formatMissionAmount(1240, 'distance_km')).toBe('1,240 km');
    expect(formatMissionAmount(46.25, 'distance_km')).toBe('46.3 km');
    expect(formatMissionAmount(1, 'runs')).toBe('1 run');
    expect(formatMissionAmount(14, 'runs')).toBe('14 runs');
    expect(formatMissionAmount(12.5, 'hours')).toBe('12.5 hours');
    expect(formatMissionAmount(1, 'hours')).toBe('1 hour');
  });
});

describe('clash', () => {
  it('puts your side first', () => {
    expect(clashScore({ a_wins: 2, b_wins: 1, my_side: 'a' }).text).toBe('2-1');
    expect(clashScore({ a_wins: 2, b_wins: 1, my_side: 'b' })).toEqual({
      mine: 1,
      theirs: 2,
      text: '1-2',
    });
    expect(clashScore({ a_wins: 0, b_wins: 3, my_side: null }).text).toBe('0-3');
    expect(clashSides({ my_side: 'b' }, 'Concordia', 'McGill')).toEqual(['McGill', 'Concordia']);
    expect(clashSides({ my_side: null }, 'Concordia', 'McGill')).toEqual(['Concordia', 'McGill']);
  });

  it('formats values by scoring', () => {
    expect(formatClashValue(912, 'time')).toBe('15:12');
    expect(formatClashValue(3723, 'time')).toBe('1:02:03');
    expect(formatClashValue(2.04, 'distance')).toBe('2.0 km');
    expect(formatClashValue(21, 'score')).toBe('21');
    expect(formatClashValue(38, 'count')).toBe('38');
    expect(formatClashValue(null, 'score')).toBeNull();
  });
});

describe('subscriptions', () => {
  it('filter by the right column', () => {
    expect(crewHomeSubscription('c1').channel).toBe('crew-home:c1');
    expect(crewHomeSubscription('c1').changes.every((c) => c.filter === 'crew_id=eq.c1')).toBe(true);
    const clan = clanSubscription('k1');
    expect(clan.changes[0]?.filter).toBe('id=eq.k1');
    expect(clan.changes.slice(1).every((c) => c.filter === 'clan_id=eq.k1')).toBe(true);
    const clash = clashSubscription('x1');
    expect(clash.channel).toBe('clash:x1');
    expect(clash.changes.slice(1).every((c) => c.filter === 'clash_id=eq.x1')).toBe(true);
  });
});
