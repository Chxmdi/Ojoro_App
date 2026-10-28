import { describe, expect, it } from 'vitest';

import {
  bestMove,
  dailyBody,
  dailyHeadline,
  downForWhen,
  downForWhere,
  formingLink,
  formingNearYou,
  peopleDown,
  pickDownFor,
  planForSport,
  recapHeadline,
  recapIsRecent,
  recapLine,
  recapWhen,
  type NearbyDown,
  type NearbyPlan,
  type RecapFacts,
} from './homeLogic';

const TZ = 'America/Toronto';
const NOW = new Date('2026-10-28T20:02:00Z');

function down(user: string, sport = 'football', over: Partial<NearbyDown> = {}): NearbyDown {
  return {
    signal_id: `${user}-${sport}`,
    sport_id: sport,
    user_id: user,
    display_name: `${user} X`,
    avatar_path: null,
    window_start: '2026-10-28T22:00:00Z',
    window_end: '2026-10-29T01:30:00Z',
    expires_at: '2026-10-29T01:30:00Z',
    ...over,
  };
}

function plan(over: Partial<NearbyPlan>): NearbyPlan {
  return {
    plan_id: 'p',
    sport_id: 'football',
    sport_name: 'Football',
    title: null,
    starts_at: '2026-10-28T23:30:00Z',
    capacity: 8,
    member_count: 6,
    effective_status: 'forming',
    place_name: 'Jeanne-Mance Park',
    i_am_in: false,
    distance_km: 1.2,
    ...over,
  };
}

describe('Down For pick', () => {
  it('shows the sport most people are down for', () => {
    const pick = pickDownFor(
      [down('a'), down('b'), down('b', 'football', { signal_id: 'dup', window_end: '2026-10-29T02:00:00Z' }), down('c', 'running')],
      [],
    );
    expect(pick?.sportId).toBe('football');
    expect(pick?.people).toEqual([
      { id: 'a', name: 'a X' },
      { id: 'b', name: 'b X' },
    ]);
    expect(pick?.latestEnd).toBe('2026-10-29T02:00:00Z');
    expect(pick?.earliestStart).toBe('2026-10-28T22:00:00Z');
    expect(pickDownFor([], [])).toBeNull();
  });

  it('breaks ties toward a sport with a forming plan, then by name', () => {
    expect(pickDownFor([down('a', 'running'), down('b', 'tennis')], [plan({ sport_id: 'tennis' })])?.sportId).toBe('tennis');
    expect(pickDownFor([down('a', 'tennis'), down('b', 'running')], [])?.sportId).toBe('running');
  });

  it('counts people, not signals', () => {
    expect(peopleDown([down('a'), down('a', 'running'), down('b')])).toBe(2);
  });

  it('finds the plan for the sport', () => {
    const plans = [
      plan({ plan_id: 'late', starts_at: '2026-10-29T00:00:00Z' }),
      plan({ plan_id: 'soon' }),
      plan({ plan_id: 'other', sport_id: 'tennis' }),
      plan({ plan_id: 'gone', effective_status: 'expired', starts_at: '2026-10-28T21:00:00Z' }),
    ];
    expect(planForSport(plans, 'football')?.plan_id).toBe('soon');
    expect(planForSport(plans, 'boxing')).toBeNull();
  });

  it('writes when and where', () => {
    expect(downForWhen('2026-10-28T22:00:00Z', NOW, TZ)).toBe('tonight');
    expect(downForWhen('2026-10-29T22:00:00Z', NOW, TZ)).toBe('tomorrow');
    expect(downForWhere(plan({}), '2026-10-29T01:30:00Z', NOW, TZ)).toBe('Jeanne-Mance Park · around 7:30 · 1.2 km');
    expect(downForWhere(plan({ place_name: null, distance_km: null }), '', NOW, TZ)).toBe('Place to be agreed · around 7:30');
    expect(downForWhere(null, '2026-10-29T01:30:00Z', NOW, TZ)).toBe('Near you · until 9:30');
    expect(formingLink(plan({}))).toBe('6 of 8 are already in a plan.');
  });
});

describe('Ojoro Daily', () => {
  it('says today or tonight', () => {
    expect(dailyHeadline(NOW, TZ)).toBe('TONIGHT.');
    expect(dailyHeadline(new Date('2026-10-28T13:00:00Z'), TZ)).toBe('TODAY.');
  });

  it('picks the best move today', () => {
    const plans = [
      plan({ plan_id: 'a', member_count: 3 }),
      plan({ plan_id: 'b', member_count: 6 }),
      plan({ plan_id: 'sat', member_count: 7, starts_at: '2026-10-31T14:00:00Z' }),
    ];
    expect(bestMove(plans, NOW, TZ)?.plan_id).toBe('b');
    expect(bestMove([], NOW, TZ)).toBeNull();
  });

  it('writes counts and the move', () => {
    expect(dailyBody({ downCount: 11, best: plan({}), now: NOW, timeZone: TZ })).toBe(
      '11 people near you want to play. Your best move: football at Jeanne-Mance Park, 7:30.',
    );
    expect(dailyBody({ downCount: 1, best: plan({ i_am_in: true, place_name: null }), now: NOW })).toBe(
      "1 person near you wants to play. You're in football, 7:30.",
    );
    expect(dailyBody({ downCount: 3, best: null, now: NOW })).toBe(
      "3 people near you want to play. Say you're down and Ojoro gathers people around it.",
    );
    expect(dailyBody({ downCount: 0, best: null, now: NOW })).toContain("Nothing's forming near you yet.");
  });
});

describe('recap block', () => {
  const r: RecapFacts = {
    occurred_at: '2026-10-22T23:30:00Z',
    duration_minutes: 90,
    played_count: 8,
    moments_count: 3,
    team_a_label: 'Lights',
    team_b_label: 'Darks',
    team_a_score: 5,
    team_b_score: 4,
  };

  it('writes the result', () => {
    expect(recapHeadline(r)).toBe('LIGHTS WIN 5–4.');
    expect(recapHeadline({ ...r, team_a_score: 2 })).toBe('DARKS WIN 4–2.');
    expect(recapHeadline({ ...r, team_b_score: 5 })).toBe('5–5. A DRAW.');
    expect(recapHeadline({ ...r, team_a_label: null })).toBe('5–4.');
    expect(recapHeadline({ ...r, team_a_score: null })).toBe('8 PLAYED.');
    expect(recapLine(r)).toBe('8 played · 90 min · 3 photos added.');
    expect(recapLine({ ...r, moments_count: 1 })).toBe('8 played · 90 min · 1 photo added.');
    expect(recapLine({ ...r, moments_count: 0 })).toBe('8 played · 90 min.');
  });

  it('says when, and keeps only recent recaps', () => {
    expect(recapWhen('2026-10-22T23:30:00Z', NOW, TZ)).toBe('LAST THURSDAY');
    expect(recapWhen('2026-10-27T23:30:00Z', NOW, TZ)).toBe('YESTERDAY');
    expect(recapWhen('2026-10-28T18:00:00Z', NOW, TZ)).toBe('EARLIER TODAY');
    expect(recapIsRecent('2026-10-22T23:30:00Z', NOW, TZ)).toBe(true);
    expect(recapIsRecent('2026-10-01T23:30:00Z', NOW, TZ)).toBe(false);
    expect(recapIsRecent('2026-10-29T23:30:00Z', NOW)).toBe(false);
  });
});

describe('forming near you', () => {
  it('leaves out your plans and what is not forming', () => {
    const plans = [
      plan({ plan_id: 'in', i_am_in: true }),
      plan({ plan_id: 'mine' }),
      plan({ plan_id: 'open' }),
      plan({ plan_id: 'on', effective_status: 'game_on' }),
    ];
    expect(formingNearYou(plans, new Set(['mine'])).map((p) => p.plan_id)).toEqual(['open']);
  });
});
