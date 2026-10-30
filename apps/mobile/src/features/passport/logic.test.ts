import type { GoalView, PassportAchievement, PassportPersonalBest, PassportStamp } from '@ojoro/contracts';
import { describe, expect, it } from 'vitest';

import {
  achievementRows,
  dateOptions,
  draftFrom,
  emptyStampsLine,
  fieldOfDetail,
  filterKey,
  filterValues,
  findStamp,
  goalBody,
  hasTarget,
  headlineLines,
  monthName,
  nextStepAction,
  nextStepTitle,
  nextTestSentence,
  parseAmount,
  parseTime,
  passportHrefFor,
  passportOverline,
  passportVisibilityLine,
  personalBestMeta,
  personalBestTitle,
  sinceLine,
  stampHref,
  stampLine,
  stampProps,
  targetField,
  toFilter,
  validateGoal,
  type GoalDraft,
} from './logic';

const TZ = 'America/Toronto';

function stamp(over: Partial<PassportStamp> = {}): PassportStamp {
  return {
    entry_id: 'e1',
    kind: 'game',
    occurred_at: '2026-10-23T17:30:00Z',
    sport_id: 'football',
    sport_name: 'Football',
    place_id: 'p1',
    place_name: 'Jeanne-Mance Park',
    place_area: 'Plateau',
    place_time_zone: TZ,
    minutes: 90,
    activity_id: 'a1',
    challenge_event_id: null,
    title: null,
    scoring: null,
    unit: null,
    value: null,
    outcome: null,
    stamp_number: 24,
    sport_number: 17,
    place_number: 13,
    place_game_number: 12,
    personal_best: false,
    previous_best: null,
    milestone: null,
    milestone_count: null,
    ...over,
  };
}

const challenge = stamp({
  entry_id: 'e2',
  kind: 'challenge',
  sport_id: 'running',
  sport_name: 'Running',
  place_name: 'Mount Royal loop',
  activity_id: null,
  challenge_event_id: 'ev1',
  title: '5K',
  scoring: 'time',
  unit: 'km',
  value: 1368,
  outcome: 'won',
  personal_best: true,
  previous_best: 1385,
  milestone: 'personal_best',
  place_game_number: null,
  minutes: 23,
});

function goal(over: Partial<GoalView> = {}): GoalView {
  return {
    goal_id: 'g1',
    user_id: 'u1',
    is_me: true,
    kind: 'personal_best',
    sport_id: 'running',
    sport_name: 'Running',
    discipline: '5K',
    scoring: 'time',
    unit: null,
    target_value: 1320,
    target_date: '2026-12-31',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    achieved_at: null,
    current_value: 1385,
    best_at: null,
    achieved: false,
    fraction: 0.5,
    next_step: null,
    next_test: null,
    ...over,
  };
}

describe('stamps', () => {
  it('builds stamp props from a game and a challenge', () => {
    expect(stampProps(stamp({ milestone: 'place_games', milestone_count: 20 }))).toEqual({
      title: '20 GAMES',
      place: 'JEANNE-MANCE',
      date: '23.10.26',
      kind: 'FOOTBALL',
    });
    expect(stampProps(challenge).title).toBe('NEW 5K PB');
    expect(stampProps(stamp({ place_name: null, place_time_zone: null }), TZ).place).toBe('OJORO');
  });

  it('links to the recap or the result, or nowhere', () => {
    expect(stampHref(stamp())).toBe('/activity/a1/recap');
    expect(stampHref(challenge)).toBe('/event/ev1');
    expect(stampHref(stamp({ activity_id: null }))).toBeNull();
  });

  it('says what a stamp was', () => {
    expect(stampLine(stamp())).toBe('Football · 90 min · Jeanne-Mance · 12th game here');
    expect(stampLine(challenge)).toBe('Running · 5K in 22:48 · won · new best (was 23:05) · Mount Royal loop');
    expect(stampLine(stamp({ kind: 'challenge', title: '5K', personal_best: true, previous_best: null, value: null, place_name: null }))).toBe(
      'Football · 5K · first best',
    );
    expect(stampLine(stamp({ minutes: 0, place_game_number: 1 }))).toBe('Football · Jeanne-Mance');
    expect(stampLine(stamp({ place_game_number: 2 }))).toContain('2nd game here');
    expect(stampLine(stamp({ place_game_number: 3 }))).toContain('3rd');
    expect(stampLine(stamp({ place_game_number: 11 }))).toContain('11th');
    expect(stampLine(stamp({ place_game_number: 21 }))).toContain('21st');
    expect(stampLine(stamp({ place_game_number: 25 }))).toContain('25th');
  });

  it('finds the stamp a link points at', () => {
    const list = [stamp(), challenge];
    expect(hasTarget({})).toBe(false);
    expect(findStamp(list, {})).toBeNull();
    expect(findStamp(list, { activity: 'a1' })?.entry_id).toBe('e1');
    expect(findStamp(list, { event: 'ev1' })?.entry_id).toBe('e2');
    expect(findStamp(list, { entry: 'e2' })?.entry_id).toBe('e2');
    expect(findStamp(list, { entry: 'nope' })).toBeNull();
  });

  it('builds passport links', () => {
    expect(passportHrefFor({})).toBe('/passport');
    expect(passportHrefFor({ entry: 'e 1' })).toBe('/passport?entry=e%201');
    expect(passportHrefFor({ activity: 'a1' })).toBe('/passport?activity=a1');
    expect(passportHrefFor({ event: 'ev1' })).toBe('/passport?event=ev1');
  });
});

describe('filters', () => {
  const view = {
    sports: [
      { sport_id: 'running', name: 'Running', stamps: 8, games: 0, challenges: 8, minutes: 1, first_at: '', last_at: '' },
      { sport_id: 'football', name: 'Football', stamps: 17, games: 16, challenges: 1, minutes: 1, first_at: '', last_at: '' },
    ],
    places: [{ place_id: 'p1', name: 'Jeanne-Mance Park', area: 'Plateau', city: 'Montréal', time_zone: TZ, stamps: 13, games: 12, first_at: '', last_at: '' }],
    months: [{ month: '2026-10', stamps: 9, minutes: 1, places: 3 }],
  };

  it('lists values with counts', () => {
    expect(filterValues(view, 'sport').map((v) => v.id)).toEqual(['football', 'running']);
    expect(filterValues(view, 'place')).toEqual([{ id: 'p1', label: 'Jeanne-Mance', count: 13 }]);
    expect(filterValues(view, 'month')).toEqual([{ id: '2026-10', label: 'October 2026', count: 9 }]);
    expect(filterValues(view, 'all')).toEqual([]);
  });

  it('turns a choice into a filter and a key', () => {
    expect(toFilter('milestones', null)).toEqual({ by: 'milestones' });
    expect(toFilter('sport', null)).toEqual({ by: 'all' });
    expect(toFilter('sport', 'running')).toEqual({ by: 'sport', sportId: 'running' });
    expect(toFilter('place', 'p1')).toEqual({ by: 'place', placeId: 'p1' });
    expect(toFilter('month', '2026-10')).toEqual({ by: 'month', month: '2026-10' });
    expect(toFilter('all', 'x')).toEqual({ by: 'all' });
    expect(filterKey({ by: 'sport', sportId: 'r' })).toBe('sport:r');
    expect(filterKey({ by: 'place', placeId: 'p' })).toBe('place:p');
    expect(filterKey({ by: 'month', month: 'm' })).toBe('month:m');
    expect(filterKey({ by: 'all' })).toBe('all');
  });

  it('has an empty line for each case', () => {
    expect(emptyStampsLine({ by: 'all' }, true)).toMatch(/first game/);
    expect(emptyStampsLine({ by: 'all' }, false)).toBe('No stamps yet.');
    expect(emptyStampsLine({ by: 'milestones' }, true)).toMatch(/firsts/);
    expect(emptyStampsLine({ by: 'month', month: 'x' }, true)).toBe('No stamps here.');
    expect(monthName('2027-01')).toBe('January 2027');
  });
});

describe('header', () => {
  it('counts with singulars', () => {
    expect(headlineLines({ stamps: 14, places: 6, people_moved_with: 23 })).toEqual(['14 STAMPS.', '6 PLACES.', '23 PEOPLE.']);
    expect(headlineLines({ stamps: 1, places: 1, people_moved_with: 1 })).toEqual(['1 STAMP.', '1 PLACE.', '1 PERSON.']);
  });

  it('names whose Passport it is', () => {
    expect(passportOverline({ is_me: true, display_name: 'Chimdi O' })).toBe('PASSPORT');
    expect(passportOverline({ is_me: false, display_name: 'Ade B' })).toBe("ADE'S PASSPORT");
    expect(passportOverline({ is_me: false, display_name: null })).toBe('PASSPORT');
  });

  it('says since when and who sees it', () => {
    expect(sinceLine(null)).toBeNull();
    expect(sinceLine('2026-03-18T13:00:00Z', TZ)).toBe('Since March 2026.');
    expect(passportVisibilityLine('friends', 'friends')).toBe('Friends see your Passport and your goal.');
    expect(passportVisibilityLine('crews', 'only_me')).toBe('Your Crews see your Passport. Only you see your goal.');
    expect(passportVisibilityLine('everyone', 'friends')).toBe('Everyone sees your Passport. Friends see your goal.');
  });
});

describe('personal bests and achievements', () => {
  const pb: PassportPersonalBest = {
    personal_best_id: 'pb1',
    sport_id: 'running',
    sport_name: 'Running',
    discipline: '5K',
    scoring: 'time',
    unit: 'km',
    value: 1368,
    previous_value: 1385,
    first_value: 1402,
    improvements: 3,
    set_at: '2026-10-29T13:00:00Z',
    place_name: 'Mount Royal loop',
    event_id: 'ev1',
  };

  it('puts a best into words', () => {
    expect(personalBestTitle(pb)).toBe('5K · 22:48');
    expect(personalBestMeta(pb, TZ)).toBe('Running · 29.10.26 at Mount Royal loop · from 23:22, beaten 3 times');
    expect(personalBestMeta({ ...pb, improvements: 1, place_name: null }, TZ)).toContain('beaten once');
    expect(personalBestMeta({ ...pb, improvements: 0 }, TZ)).toContain('first result');
  });

  it('splits reached and next tiers', () => {
    const rows: PassportAchievement[] = [
      { ladder: 'sessions', family: 'participation', threshold: 10, achieved: true, achieved_at: '2026-08-01T12:00:00Z', current: 25, context: null },
      { ladder: 'regular', family: 'participation', threshold: 10, achieved: true, achieved_at: '2026-10-09T12:00:00Z', current: 12, context: 'Jeanne-Mance Park' },
      { ladder: 'places', family: 'exploration', threshold: 5, achieved: false, achieved_at: null, current: 3, context: null },
      { ladder: 'sports', family: 'exploration', threshold: 3, achieved: false, achieved_at: null, current: 2, context: null },
    ];
    const { reached, next } = achievementRows(rows, TZ);
    expect(reached.map((r) => r.title)).toEqual(['10 GAMES AT ONE PLACE', '10 STAMPS']);
    expect(reached[0]!.meta).toBe('Jeanne-Mance · 09.10.26');
    expect(next.map((r) => r.meta)).toEqual(['2 of 3 so far', '3 of 5 so far']);
    const undated = achievementRows([{ ...rows[0]!, achieved_at: null }, { ...rows[1]!, achieved_at: null }]);
    expect(undated.reached).toHaveLength(2);
  });
});

describe('goals', () => {
  const now = new Date('2026-10-28T16:00:00Z'); // Wednesday in Montréal

  it('says when the next test is', () => {
    const test = { event_id: 'e', title: '5K', time_zone: TZ, place_name: null, opponent_name: null };
    expect(nextTestSentence({ ...test, starts_at: '2026-10-31T13:00:00Z' }, now)).toBe('The Call-Out on Saturday is your next real test.');
    expect(nextTestSentence({ ...test, starts_at: '2026-10-28T22:00:00Z' }, now)).toContain('today');
    expect(nextTestSentence({ ...test, starts_at: '2026-10-29T22:00:00Z' }, now)).toContain('tomorrow');
    expect(nextTestSentence({ ...test, starts_at: '2026-11-14T15:00:00Z' }, now)).toContain('on 14 Nov');
  });

  it('builds the body under the goal', () => {
    expect(goalBody(goal(), now)).toBe('Best so far: 23:05.');
    const test = { event_id: 'e', title: '5K', starts_at: '2026-10-31T13:00:00Z', time_zone: TZ, place_name: null, opponent_name: null };
    expect(goalBody(goal({ next_test: test }), now)).toBe('Best so far: 23:05. The Call-Out on Saturday is your next real test.');
    expect(goalBody(goal({ next_test: test, achieved: true }), now)).toBe('Reached.');
  });

  it('names the next step and what its button does', () => {
    const step = {
      kind: 'plan' as const,
      plan_id: 'p',
      activity_id: null,
      sport_id: 'running',
      sport_name: 'Running',
      title: 'Tempo run',
      starts_at: '2026-10-29T22:30:00Z',
      status: 'forming',
      member_count: 3,
      capacity: 8,
      spots_left: 5,
      place_id: null,
      place_name: 'Plateau Run Club',
      place_area: null,
      place_time_zone: TZ,
      action: 'join',
      reason: '',
    };
    expect(nextStepTitle(step)).toBe('Tempo run · Thu 6:30 · Plateau Run Club');
    expect(nextStepTitle({ ...step, title: null, place_name: null })).toBe('Running · Thu 6:30');
    expect(nextStepAction(step)).toEqual({ label: "I'M DOWN", joins: true });
    expect(nextStepAction({ ...step, action: 'waitlist' }).label).toBe('JOIN WAITLIST');
    expect(nextStepAction({ ...step, action: 'watch' }).label).toBe('SEE THE PLAN');
  });

  it('parses times and amounts', () => {
    expect(parseTime('22')).toBe(1320);
    expect(parseTime('22:30')).toBe(1350);
    expect(parseTime('1:02:05')).toBe(3725);
    expect(parseTime('22:75')).toBeNull();
    expect(parseTime('abc')).toBeNull();
    expect(parseAmount('12,5')).toBe(12.5);
    expect(parseAmount('-1')).toBeNull();
  });

  it('starts a draft from the goal, or empty', () => {
    expect(draftFrom(null, 'running')).toMatchObject({ kind: 'personal_best', sportId: 'running', target: '' });
    expect(draftFrom(goal(), null)).toMatchObject({ discipline: '5K', target: '22:00', date: '2026-12-31' });
    expect(draftFrom(goal({ kind: 'places', sport_id: null, discipline: null, scoring: null, target_value: 3 }), 'x')).toMatchObject({
      kind: 'places',
      sportId: null,
      target: '3',
    });
    expect(draftFrom(goal({ scoring: 'distance', target_value: 12 }), null).target).toBe('12');
  });

  const base: GoalDraft = { kind: 'personal_best', sportId: 'running', discipline: ' 5k ', scoring: 'time', target: '22:00', date: null };

  it('validates a personal best', () => {
    expect(validateGoal(base)).toEqual({
      ok: true,
      args: { p_kind: 'personal_best', p_target_value: 1320, p_sport_id: 'running', p_discipline: '5K', p_scoring: 'time' },
    });
    expect(validateGoal({ ...base, sportId: null })).toMatchObject({ ok: false, field: 'sport' });
    expect(validateGoal({ ...base, discipline: '' })).toMatchObject({ ok: false, field: 'discipline' });
    expect(validateGoal({ ...base, discipline: 'x'.repeat(25) })).toMatchObject({ ok: false, field: 'discipline' });
    expect(validateGoal({ ...base, target: 'soon' })).toMatchObject({ ok: false, field: 'target' });
    expect(validateGoal({ ...base, target: '0:30' })).toMatchObject({ ok: false, field: 'target' });
    expect(validateGoal({ ...base, scoring: 'distance', target: '12', date: '2026-12-31' })).toMatchObject({
      ok: true,
      args: { p_target_value: 12, p_scoring: 'distance', p_target_date: '2026-12-31' },
    });
    expect(validateGoal({ ...base, scoring: 'distance', target: '0' })).toMatchObject({ ok: false, field: 'target' });
  });

  it('validates counts', () => {
    expect(validateGoal({ ...base, kind: 'sessions', target: '10' })).toEqual({
      ok: true,
      args: { p_kind: 'sessions', p_target_value: 10, p_sport_id: 'running' },
    });
    expect(validateGoal({ ...base, kind: 'places', target: '3' })).toEqual({ ok: true, args: { p_kind: 'places', p_target_value: 3 } });
    expect(validateGoal({ ...base, kind: 'places', target: '101' })).toMatchObject({ ok: false, field: 'target' });
    expect(validateGoal({ ...base, kind: 'sessions', target: '2.5' })).toMatchObject({ ok: false, field: 'target' });
  });

  it('maps server details to fields', () => {
    expect(fieldOfDetail('target_value')).toBe('target');
    expect(fieldOfDetail('scoring')).toBe('target');
    expect(fieldOfDetail('target_date')).toBe('date');
    expect(fieldOfDetail('sport')).toBe('sport');
    expect(fieldOfDetail('discipline')).toBe('discipline');
    expect(fieldOfDetail('kind')).toBe('kind');
    expect(fieldOfDetail('other')).toBeNull();
    expect(fieldOfDetail(null)).toBeNull();
  });

  it('offers month ends to aim for', () => {
    const opts = dateOptions(new Date('2026-11-15T12:00:00Z'), 3, TZ, '2027-06-14');
    expect(opts).toEqual([
      { value: '2026-11-30', label: 'End of November' },
      { value: '2026-12-31', label: 'End of December' },
      { value: '2027-01-31', label: 'End of January 2027' },
      { value: '2027-06-14', label: 'By 14 June 2027' },
    ]);
    expect(dateOptions(new Date('2026-11-15T12:00:00Z'), 1, TZ, '2026-11-30')).toHaveLength(1);
    expect(dateOptions(new Date('2026-11-15T12:00:00Z'), 1, TZ, '2026-11-20')[1]!.label).toBe('By 20 November');
  });

  it('labels the target field', () => {
    expect(targetField({ kind: 'personal_best', scoring: 'time' }).label).toBe('Target time');
    expect(targetField({ kind: 'personal_best', scoring: 'distance' }).numeric).toBe(true);
    expect(targetField({ kind: 'sessions', scoring: 'time' }).label).toBe('How many sessions');
    expect(targetField({ kind: 'places', scoring: 'time' }).label).toBe('How many new places');
  });
});
