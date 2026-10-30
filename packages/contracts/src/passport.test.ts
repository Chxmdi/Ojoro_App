import { describe, expect, it } from 'vitest';
import {
  achievementProgress,
  achievementTitle,
  formatDuration,
  formatGap,
  formatResultValue,
  goalDateLabel,
  goalGapSentence,
  goalHeadline,
  goalProgressLine,
  monthLabel,
  passportErrorCodes,
  passportIdempotentRpcs,
  passportRpcs,
  passportStampsArgs,
  passportSubscription,
  reputationLabel,
  showUpSentence,
  stampHeadline,
} from './passport';
import { idempotentRpcs, isOjoroErrorCode } from './slice01';

const today = new Date('2026-10-30T12:00:00Z');

describe('passport contract', () => {
  it('lists every idempotent RPC among the RPCs and in idempotentRpcs', () => {
    for (const rpc of passportIdempotentRpcs) {
      expect(passportRpcs).toContain(rpc);
      expect(idempotentRpcs).toContain(rpc);
    }
  });

  it('lists the single-stamp reads', () => {
    expect(passportRpcs).toContain('passport_entry');
    expect(passportRpcs).toContain('passport_entry_for');
  });

  it('registers its error codes', () => {
    for (const code of passportErrorCodes) expect(isOjoroErrorCode(code)).toBe(true);
  });

  it('formats times, distances and gaps', () => {
    expect(formatDuration(1385)).toBe('23:05');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(-3)).toBe('0:00');
    expect(formatResultValue('time', 1368)).toBe('22:48');
    expect(formatResultValue('distance', 12.4, 'km')).toBe('12.4 km');
    expect(formatResultValue('distance', 10)).toBe('10 km');
    expect(formatResultValue('score', 3)).toBe('3');
    expect(formatResultValue('time', null)).toBe('');
    expect(formatGap('time', 49)).toBe('49 s');
    expect(formatGap('time', -75)).toBe('1:15');
    expect(formatGap('distance', 0.4, 'km')).toBe('0.4 km');
  });

  it('names months in the display face', () => {
    expect(monthLabel('2026-10')).toBe('OCTOBER 2026');
    expect(monthLabel('2027-01')).toBe('JANUARY 2027');
  });

  it('writes stamp headlines by milestone', () => {
    const base = { kind: 'game' as const, sport_name: 'Boxing', title: null, outcome: null };
    expect(stampHeadline({ ...base, milestone: 'first_stamp' })).toBe('FIRST GAME');
    expect(stampHeadline({ ...base, kind: 'challenge', milestone: 'first_stamp' })).toBe(
      'FIRST CHALLENGE',
    );
    expect(stampHeadline({ ...base, milestone: 'first_in_sport' })).toBe('FIRST BOXING');
    expect(
      stampHeadline({ ...base, kind: 'challenge', title: '10K', milestone: 'first_in_discipline' }),
    ).toBe('FIRST 10K');
    expect(
      stampHeadline({ ...base, kind: 'challenge', title: '5K', milestone: 'personal_best' }),
    ).toBe('NEW 5K PB');
    expect(stampHeadline({ ...base, milestone: 'first_challenge' })).toBe('FIRST CHALLENGE');
    expect(stampHeadline({ ...base, milestone: 'first_at_place' })).toBe('FIRST TIME HERE');
    expect(stampHeadline({ ...base, milestone: 'place_games', milestone_count: 20 })).toBe(
      '20 GAMES',
    );
    expect(stampHeadline({ ...base, milestone: 'stamps', count: 50 })).toBe('50 STAMPS');
    expect(
      stampHeadline({ ...base, kind: 'challenge', title: '5k', outcome: 'won', milestone: null }),
    ).toBe('5K · WON');
    expect(
      stampHeadline({ ...base, kind: 'challenge', title: '5K', outcome: 'lost', milestone: null }),
    ).toBe('5K · LOST');
    expect(
      stampHeadline({ ...base, kind: 'challenge', title: '1v1', outcome: 'draw', milestone: null }),
    ).toBe('1V1 · DRAW');
    expect(stampHeadline({ ...base, milestone: null, sport_number: 12 })).toBe('GAME 12');
    expect(stampHeadline({ ...base, milestone: null })).toBe('BOXING');
  });

  it('names achievements and their progress, without points', () => {
    expect(achievementTitle('sessions', 1)).toBe('FIRST STAMP');
    expect(achievementTitle('sessions', 25)).toBe('25 STAMPS');
    expect(achievementTitle('regular', 10)).toBe('10 GAMES AT ONE PLACE');
    expect(achievementTitle('challenges', 1)).toBe('FIRST CHALLENGE');
    expect(achievementTitle('challenges', 5)).toBe('5 CHALLENGES');
    expect(achievementTitle('people', 25)).toBe('MOVED WITH 25 PEOPLE');
    expect(achievementTitle('places', 5)).toBe('5 PLACES');
    expect(achievementTitle('sports', 3)).toBe('3 SPORTS');
    expect(achievementTitle('personal_bests', 1)).toBe('FIRST PB');
    expect(achievementTitle('personal_bests', 5)).toBe('5 PBS');
    expect(achievementTitle('goals', 1)).toBe('FIRST GOAL REACHED');
    expect(achievementTitle('goals', 3)).toBe('3 GOALS REACHED');
    expect(achievementTitle('hosted', 1)).toBe('FIRST GAME HOSTED');
    expect(achievementTitle('hosted', 10)).toBe('10 GAMES HOSTED');
    expect(achievementProgress({ achieved: false, current: 6, threshold: 10 })).toBe('6 of 10');
    expect(achievementProgress({ achieved: false, current: 12, threshold: 10 })).toBe('10 of 10');
    expect(achievementProgress({ achieved: true, current: 12, threshold: 10 })).toBeNull();
  });

  it('labels reputation and the show-up record', () => {
    expect(reputationLabel('shows_up', 31)).toBe('SHOWS UP · 31');
    expect(reputationLabel('welcomes_beginners')).toBe('WELCOMES BEGINNERS');
    expect(showUpSentence({ showed_up: 46, committed: 48 })).toBe('Showed up to 46 of 48 games.');
    expect(showUpSentence({ showed_up: 1, committed: 1 })).toBe('Showed up to 1 of 1 game.');
  });

  it('writes goal headlines and dates', () => {
    expect(goalDateLabel('2026-12-31', today)).toBe('BY DECEMBER');
    expect(goalDateLabel('2027-03-31', today)).toBe('BY MARCH 2027');
    expect(goalDateLabel('2026-11-14', today)).toBe('BY 14 NOVEMBER');
    expect(goalDateLabel('2027-02-14', today)).toBe('BY 14 FEBRUARY 2027');
    const pb = {
      kind: 'personal_best' as const,
      discipline: '5K',
      scoring: 'time' as const,
      target_value: 1320,
      target_date: '2026-12-31',
      sport_name: 'Running',
      unit: null,
    };
    expect(goalHeadline(pb, today)).toBe('SUB-22 5K BY DECEMBER.');
    expect(goalHeadline({ ...pb, target_value: 1335, target_date: null }, today)).toBe(
      'SUB-22:15 5K.',
    );
    expect(
      goalHeadline(
        { ...pb, discipline: 'Hour ride', scoring: 'distance', target_value: 30, unit: 'km' },
        today,
      ),
    ).toBe('HOUR RIDE OVER 30 KM BY DECEMBER.');
    expect(
      goalHeadline(
        {
          ...pb,
          kind: 'sessions',
          discipline: null,
          scoring: null,
          target_value: 10,
          sport_name: null,
        },
        today,
      ),
    ).toBe('10 SESSIONS BY DECEMBER.');
    expect(
      goalHeadline(
        {
          ...pb,
          kind: 'sessions',
          discipline: null,
          scoring: null,
          target_value: 1,
          target_date: null,
        },
        today,
      ),
    ).toBe('1 RUNNING SESSION.');
    expect(
      goalHeadline(
        {
          ...pb,
          kind: 'places',
          discipline: null,
          scoring: null,
          target_value: 3,
          sport_name: null,
        },
        today,
      ),
    ).toBe('3 NEW PLACES BY DECEMBER.');
    expect(
      goalHeadline(
        {
          ...pb,
          kind: 'places',
          discipline: null,
          scoring: null,
          target_value: 1,
          target_date: null,
        },
        today,
      ),
    ).toBe('1 NEW PLACE.');
  });

  it('writes goal progress and the Result gap', () => {
    const pb = {
      kind: 'personal_best' as const,
      scoring: 'time' as const,
      unit: null,
      target_value: 1320,
    };
    expect(goalProgressLine({ ...pb, current_value: 1385, achieved: false })).toBe(
      'Best so far: 23:05.',
    );
    expect(goalProgressLine({ ...pb, current_value: null, achieved: false })).toBe(
      'No result yet. A Challenge in this discipline sets your first.',
    );
    expect(goalProgressLine({ ...pb, current_value: 1300, achieved: true })).toBe('Reached.');
    expect(
      goalProgressLine({
        kind: 'sessions',
        scoring: null,
        unit: null,
        target_value: 10,
        current_value: 4,
        achieved: false,
      }),
    ).toBe('4 of 10 so far.');
    expect(
      goalProgressLine({
        kind: 'places',
        scoring: null,
        unit: null,
        target_value: 3,
        current_value: null,
        achieved: false,
      }),
    ).toBe('0 of 3 so far.');
    expect(goalGapSentence({ goal_gap: 49, scoring: 'time', unit: 'km' })).toBe(
      '49 s off your goal.',
    );
    expect(goalGapSentence({ goal_gap: -12, scoring: 'time', unit: 'km' })).toBe(
      'Past your goal by 12 s.',
    );
    expect(goalGapSentence({ goal_gap: 0, scoring: 'time', unit: null })).toBe(
      'Right on your goal.',
    );
    expect(goalGapSentence({ goal_gap: null, scoring: 'time', unit: null })).toBeNull();
  });

  it('builds passport_stamps arguments from a filter', () => {
    expect(passportStampsArgs('u')).toEqual({ p_user_id: 'u', p_limit: 30 });
    expect(
      passportStampsArgs('u', { by: 'place', placeId: 'p' }, '2026-10-01T00:00:00Z', 10),
    ).toEqual({
      p_user_id: 'u',
      p_place_id: 'p',
      p_before: '2026-10-01T00:00:00Z',
      p_limit: 10,
    });
    expect(passportStampsArgs('u', { by: 'sport', sportId: 'running' })).toMatchObject({
      p_sport_id: 'running',
    });
    expect(passportStampsArgs('u', { by: 'month', month: '2026-10' })).toMatchObject({
      p_month: '2026-10',
    });
    expect(passportStampsArgs('u', { by: 'milestones' })).toMatchObject({
      p_milestones_only: true,
    });
  });

  it('subscribes to one person’s stamps, bests and goal', () => {
    const sub = passportSubscription('u1');
    expect(sub.channel).toBe('passport:u1');
    expect(sub.changes.map((c) => c.table)).toEqual([
      'passport_entries',
      'personal_bests',
      'goals',
    ]);
    expect(sub.changes.every((c) => c.filter === 'user_id=eq.u1')).toBe(true);
  });
});
