import type {
  HostFixtureResultState,
  HostInsights,
  HostInsightsWeek,
  HostResultToConfirm,
  HostRoundFixture,
  HostSeriesInsight,
  HostStanding,
} from '@ojoro/contracts';
import { describe, expect, it } from 'vitest';

import {
  aboutDuration,
  canConfirm,
  canDispute,
  chartCaption,
  confirmBlockedNote,
  countText,
  feeNote,
  fixtureModel,
  fixturesMeta,
  hoursChangeSentence,
  hoursExplainer,
  insightTiles,
  lastWeekLabel,
  moneyLocale,
  readinessNote,
  relativeDay,
  resultDetail,
  resultScore,
  resultStatusLine,
  revenueLines,
  roundHeading,
  scoreLine,
  seasonOverline,
  seasonSummary,
  seasonTitle,
  seriesRow,
  spokenScore,
  standingsNote,
  standingsRows,
  standingsShareText,
  teamsMeta,
  tieBreakLine,
  timesWord,
  weekData,
} from './seasonLogic';

const TZ = 'America/Toronto';
const home = { id: 't2', name: 'Thursday FC', crew_id: null, captain_id: 'c2' };
const away = { id: 't4', name: 'Plateau Crew', crew_id: null, captain_id: 'c4' };

function result(over: Partial<HostFixtureResultState> = {}): HostFixtureResultState {
  return {
    fixture_id: 'f1',
    status: 'agreed',
    home_goals: 4,
    away_goals: 2,
    submissions: [
      { team_id: 't2', home_goals: 4, away_goals: 2, submitted_by: 'c2', created_at: '2026-10-30T01:00:00Z' },
      { team_id: 't4', home_goals: 4, away_goals: 2, submitted_by: 'c4', created_at: '2026-10-30T01:05:00Z' },
    ],
    confirmed_at: null,
    source: null,
    ...over,
  };
}

function toConfirm(over: Partial<HostResultToConfirm> = {}): HostResultToConfirm {
  return {
    fixture_id: 'f1',
    round: 2,
    // Thursday 7:30 PM in Montréal, moved from Saturday 11:30 AM.
    kicks_off_at: '2026-10-29T23:30:00Z',
    rescheduled_from: '2026-10-24T15:30:00Z',
    home,
    away,
    result: result(),
    players_in: 14,
    checked_in: 13,
    ...over,
  };
}

function standing(over: Partial<HostStanding>): HostStanding {
  return {
    team_id: 'x',
    team_name: 'X',
    position: 1,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goals_for: 0,
    goals_against: 0,
    goal_difference: 0,
    points: 0,
    pending_count: 0,
    ...over,
  };
}

const league = {
  rounds_total: 10,
  meetings: 2,
  team_count: 6,
  player_count: 64,
  free_agent_count: 9,
  starts_on: '2026-10-17',
  venue_label: 'Jeanne-Mance',
  time_zone: TZ,
  min_players: 7,
  name: 'Winter League',
};

function fixture(over: Partial<HostRoundFixture> = {}): HostRoundFixture {
  return {
    fixture_id: 'fx',
    kicks_off_at: '2026-10-31T13:00:00Z',
    pitch: 'Turf 1',
    status: 'scheduled',
    home: { id: 'h', name: 'Lachine Locos', crew_id: null, captain_id: null },
    away: { id: 'a', name: 'Concordia Old Boys', crew_id: null, captain_id: null },
    home_in: 9,
    away_in: 6,
    home_checked_in: 0,
    away_checked_in: 0,
    referee: { fixture_id: 'fx', referee: null, referee_status: null, refs_count: null, asked_at: null },
    referee_suggestion: { person: { id: 'yara', display_name: 'Yara M', avatar_path: null }, refs_count: 2 },
    ...over,
  };
}

describe('season words', () => {
  it('writes scores and counts', () => {
    expect(scoreLine(4, 2)).toBe('4–2');
    expect(spokenScore(4, 2)).toBe('4 to 2');
    expect([timesWord(1), timesWord(2), timesWord(3)]).toEqual(['once', 'twice', '3 times']);
  });

  it('headers the season', () => {
    expect(seasonOverline(league, { number: 3 })).toBe('ROUND 3 OF 10');
    expect(seasonOverline(league, null)).toBe('10 ROUNDS PLAYED');
    expect(seasonTitle('Winter League')).toBe('WINTER LEAGUE.');
    expect(seasonTitle('Done.')).toBe('DONE.');
  });

  it('says when the round kicks off, relative to now', () => {
    const now = new Date('2026-10-28T16:00:00Z'); // Wednesday
    const fixtures = [fixture({ kicks_off_at: '2026-10-31T14:15:00Z' }), fixture({ kicks_off_at: '2026-10-31T13:00:00Z' })];
    expect(seasonSummary(league, { number: 3, fixtures }, now)).toBe(
      '6 teams, 10 Saturdays at Jeanne-Mance. Round 3 kicks off this Saturday at 9:00.',
    );
    expect(seasonSummary({ ...league, venue_label: null }, { number: 3, fixtures: [] }, now)).toBe(
      '6 teams, 10 Saturdays. Round 3 is next.',
    );
    expect(seasonSummary(league, null, now)).toMatch(/Every round is played\.$/);
    expect(relativeDay('2026-10-28T20:00:00Z', now, TZ)).toBe('today');
    expect(relativeDay('2026-10-29T20:00:00Z', now, TZ)).toBe('tomorrow');
    expect(relativeDay('2026-10-26T20:00:00Z', now, TZ)).toBe('last Monday');
    expect(relativeDay('2026-11-14T20:00:00Z', now, TZ)).toBe('Saturday Nov 14');
  });

  it('describes the result to confirm', () => {
    expect(resultDetail(toConfirm(), TZ)).toBe(
      'Round 2, played Thursday, moved from Saturday. Both captains sent 4–2 and 13 of 14 players checked in at the pitch.',
    );
    expect(resultDetail(toConfirm({ rescheduled_from: null, players_in: 0 }), TZ)).toBe(
      'Round 2, played Thursday. Both captains sent 4–2.',
    );
    expect(resultStatusLine(toConfirm({ result: result({ status: 'agreed', home_goals: null }) }))).toBe(
      'Both captains sent the same score',
    );
    const one = result({ status: 'one_sent', submissions: [result().submissions[1]!] });
    expect(resultStatusLine(toConfirm({ result: one }))).toBe("Plateau Crew sent 4–2. Thursday FC hasn't sent a score yet");
    expect(resultStatusLine(toConfirm({ result: result({ status: 'one_sent', submissions: [] }) }))).toBe(
      'One captain has sent a score',
    );
    const differ = result({
      status: 'differ',
      submissions: [
        { team_id: 't2', home_goals: 4, away_goals: 2, submitted_by: 'c2', created_at: '' },
        { team_id: 't4', home_goals: 3, away_goals: 2, submitted_by: 'c4', created_at: '' },
      ],
    });
    expect(resultStatusLine(toConfirm({ result: differ }))).toBe(
      'The captains sent different scores: Thursday FC 4–2, Plateau Crew 3–2',
    );
    expect(resultStatusLine(toConfirm({ result: result({ status: 'differ', submissions: [] }) }))).toBe(
      'The captains sent different scores',
    );
    expect(resultStatusLine(toConfirm({ result: result({ status: 'disputed' }) }))).toMatch(/^Disputed/);
    expect(resultStatusLine(toConfirm({ result: result({ status: 'waiting' }) }))).toBe('No score from the captains yet');
  });

  it('only confirms an agreed score, and disputes until settled', () => {
    expect(resultScore(result())).toEqual({ shown: '4–2', spoken: '4 to 2' });
    expect(resultScore(result({ home_goals: null }))).toEqual({ shown: '–', spoken: 'No score yet' });
    expect(canConfirm({ status: 'agreed' })).toBe(true);
    expect(canConfirm({ status: 'differ' })).toBe(false);
    expect(canDispute({ status: 'agreed' })).toBe(true);
    expect(canDispute({ status: 'disputed' })).toBe(false);
    expect(canDispute({ status: 'confirmed' })).toBe(false);
    expect(confirmBlockedNote({ status: 'agreed' })).toBeNull();
    expect(confirmBlockedNote({ status: 'confirmed' })).toBeNull();
    expect(confirmBlockedNote({ status: 'differ' })).toMatch(/dispute it/);
    expect(confirmBlockedNote({ status: 'disputed' })).toMatch(/Waiting on both captains/);
    expect(confirmBlockedNote({ status: 'waiting' })).toBe('Confirm once both captains send the same score.');
  });

  it('lays out the standings in the server order', () => {
    const rows = standingsRows(
      [
        standing({ team_id: 'm', team_name: 'Mile End Strikers', position: 1, played: 2, won: 2, goal_difference: 4, points: 6 }),
        standing({ team_id: 'c', team_name: 'Concordia Old Boys', position: 6, played: 2, lost: 2, goal_difference: -3 }),
      ],
      new Set(['c']),
    );
    expect(rows[0]).toEqual({
      key: 'm',
      highlighted: false,
      cells: { pos: 1, team: 'Mile End Strikers', p: 2, w: 2, d: 0, l: 0, gd: '+4', pts: 6 },
    });
    expect(rows[1]!.cells.gd).toBe('−3');
    expect(rows[1]!.highlighted).toBe(true);
    expect(standingsRows([])).toEqual([]);
  });

  it('notes games in hand, or the shading after a confirm', () => {
    const two = [
      standing({ team_name: 'Thursday FC', pending_count: 1 }),
      standing({ team_name: 'Plateau Crew', pending_count: 1 }),
      standing({ team_name: 'Lachine Locos' }),
    ];
    expect(standingsNote(two, false)).toBe('Thursday FC and Plateau Crew have a game in hand until you confirm.');
    expect(standingsNote([standing({ team_name: 'A', pending_count: 2 })], false)).toBe(
      'A has games in hand until you confirm.',
    );
    expect(standingsNote([standing({ team_name: 'A', pending_count: 1 })], false)).toBe(
      'A has a game in hand until you confirm.',
    );
    expect(standingsNote([standing({})], false)).toBeNull();
    expect(standingsNote(two, true)).toBe('Shaded rows moved with the result you just confirmed.');
  });

  it('writes the season tools and round heading', () => {
    expect(tieBreakLine(['points', 'goal_difference', 'goals_scored'])).toBe(
      'Points, then goal difference, then goals scored',
    );
    expect(tieBreakLine(['head_to_head'])).toBe('Head to head');
    expect(roundHeading({ number: 3, plays_on: '2026-10-31' })).toBe('ROUND 3 · SAT OCT 31');
    expect(fixturesMeta(league)).toBe('10 rounds, everyone plays everyone twice');
    expect(teamsMeta(league)).toBe('6 teams · 64 players · 9 free agents');
    expect(readinessNote(league)).toBe(
      'Teams need 7 checked in by kick-off. 9 free agents are on the league list if one is short.',
    );
    expect(readinessNote({ min_players: 7, free_agent_count: 1 })).toMatch(/1 free agent is/);
    expect(readinessNote({ min_players: 7, free_agent_count: 0 })).toBe('Teams need 7 checked in by kick-off.');
  });

  it('models a fixture: referee, readiness and the ask', () => {
    const short = fixtureModel(fixture(), league);
    expect(short.time).toBe('9:00');
    expect(short.match).toBe('Lachine Locos v Concordia Old Boys');
    expect(short.refLine).toBe('No ref yet. Yara M is free and has reffed twice.');
    expect(short.badge).toEqual({ label: '6 OF 7 · CONCORDIA', tone: 'signal' });
    expect(short.ask).toEqual({ userId: 'yara', name: 'Yara M', label: 'ASK YARA TO REF' });

    const kofi = { id: 'k', display_name: 'Kofi A', avatar_path: null };
    const ready = fixtureModel(
      fixture({
        home_in: 7,
        away_in: 8,
        referee: { fixture_id: 'fx', referee: kofi, referee_status: 'accepted', refs_count: 0, asked_at: null },
        referee_suggestion: null,
      }),
      league,
    );
    expect(ready.refLine).toBe('Ref: Kofi A');
    expect(ready.badge).toEqual({ label: '7 + 8 IN', tone: 'neutral' });
    expect(ready.ask).toBeNull();

    const asked = fixtureModel(
      fixture({ referee: { fixture_id: 'fx', referee: kofi, referee_status: 'asked', refs_count: 0, asked_at: null } }),
      league,
    );
    expect(asked.refLine).toBe('Ref: Kofi A · asked, waiting for an answer');
    expect(asked.ask).toBeNull();

    const declined = fixtureModel(
      fixture({ referee: { fixture_id: 'fx', referee: kofi, referee_status: 'declined', refs_count: 0, asked_at: null } }),
      league,
    );
    expect(declined.refLine).toBe("Kofi A can't ref. No ref yet. Yara M is free and has reffed twice.");
    expect(declined.ask?.userId).toBe('yara');

    const nobody = fixtureModel(fixture({ referee_suggestion: null }), league);
    expect(nobody.refLine).toBe('No ref yet. Nobody on the referee list is free.');
    const fresh = fixtureModel(
      fixture({ referee_suggestion: { person: { id: 'z', display_name: 'Zed', avatar_path: null }, refs_count: 0 } }),
      league,
    );
    expect(fresh.refLine).toMatch(/hasn't reffed yet/);

    expect(fixtureModel(fixture({ status: 'postponed' }), league).badge.label).toBe('POSTPONED');
    expect(fixtureModel(fixture({ status: 'cancelled' }), league).badge.label).toBe('CALLED OFF');
    expect(fixtureModel(fixture({ status: 'played' }), league).badge.label).toBe('PLAYED');
  });

  it('shares the table as text', () => {
    expect(
      standingsShareText(league, [standing({ position: 1, team_name: 'Mile End Strikers', points: 6, goal_difference: 4 })]),
    ).toBe('Winter League standings\n1. Mile End Strikers · 6 pts · +4 GD');
  });
});

function week(start: string, people: number, over: Partial<HostInsightsWeek> = {}): HostInsightsWeek {
  return { week_start: start, people, sessions: 5, skipped: [], ...over };
}

function insights(over: Partial<HostInsights> = {}): HostInsights {
  return {
    program_id: 'p',
    program_name: 'Plateau Pickup',
    time_zone: TZ,
    days: 30,
    from: '',
    to: '',
    ojoro_hours: 412,
    ojoro_hours_before: 349,
    sessions: 13,
    show_up_rate: 0.91,
    show_up_rate_before: 0.88,
    return_rate: 0.64,
    return_rate_before: 0.59,
    fill: {
      series_id: 's',
      series_name: 'Tuesday 7-a-side',
      repeat_days: [2],
      filled_sessions: 4,
      median_seconds: 26 * 3600,
      median_seconds_before: 30 * 3600,
    },
    payout_cents: 154400,
    payout_cents_before: 137900,
    currency: 'CAD',
    weeks: [],
    by_series: [],
    revenue: {
      currency: 'CAD',
      gross_cents: 166000,
      refunds_cents: 3200,
      refund_count: 4,
      fee_cents: 8400,
      net_cents: 154400,
      pass_count: 5,
      session_count: 9,
      lines: [{ kind: 'drop_in', count: 85, unit_cents: 800, amount_cents: 68000 }],
    },
    fee_policy: { placeholder: true, rate_bps: 800, rounding_cents: 100, basis: 'gross_charges_per_payout' },
    provider: 'none',
    payments_connected: false,
    ...over,
  };
}

describe('insights words', () => {
  it('explains Ojoro hours and their change', () => {
    expect(hoursExplainer(insights())).toBe(
      'Everyone who checked in, times how long they played. Up 18% on the 30 days before.',
    );
    expect(hoursChangeSentence(90, 100, 30)).toBe(' Down 10% on the 30 days before.');
    expect(hoursChangeSentence(100, 100, 30)).toBe(' Same as the 30 days before.');
    expect(hoursChangeSentence(100, 0, 30)).toBe('');
    expect(countText(1240)).toBe('1,240');
  });

  it('builds the four tiles', () => {
    expect(insightTiles(insights())).toEqual([
      { key: 'show-up', value: '91%', label: 'Showed up', delta: '+3 pts on the 30 days before' },
      { key: 'return', value: '64%', label: 'Came back within 2 weeks', delta: '+5 pts' },
      { key: 'fill', value: '1 DAY', label: 'For Tuesday to fill', delta: '4 hours faster' },
      { key: 'payout', value: '$1,544', label: 'Paid out to you', delta: '+12%' },
    ]);
    const empty = insightTiles(
      insights({ show_up_rate: null, return_rate: null, fill: null, payout_cents: 0, payout_cents_before: 0 }),
    );
    expect(empty.map((t) => t.value)).toEqual(['–', '–', '–', '$0']);
    expect(empty[2]!.label).toBe('No session filled up yet');
    expect(empty.every((t) => t.key === 'fill' || t.delta === undefined)).toBe(true);
    const multi = insightTiles(insights({ fill: { ...insights().fill!, repeat_days: [2, 4] } }));
    expect(multi[2]!.label).toBe('For Tuesday 7-a-side to fill');
  });

  it('turns weeks into chart data, with the called-off sessions in words', () => {
    const weeks = [
      week('2026-09-14', 31, {
        sessions: 4,
        skipped: [{ session_id: 's', starts_at: '2026-09-17T23:30:00Z', series_name: 'Mixed 5s', reason: null }],
      }),
      week('2026-09-28', 58),
    ];
    const data = weekData(weeks, TZ);
    expect(data[0]).toEqual({
      key: '2026-09-14',
      label: 'Sep 14',
      value: 31,
      meta: 'Week of Sep 14 · 4 sessions · Thursday called off',
      extra: { sessions: 4 },
      accessibilityLabel: 'Week of Sep 14, 4 sessions, Thursday called off: 31 people',
    });
    expect(data[1]!.meta).toBe('Week of Sep 28 · 5 sessions');
    expect(chartCaption(weeks, TZ)).toBe('The week of Sep 14 had a session called off (Thursday).');
    expect(chartCaption([week('2026-09-28', 1)], TZ)).toBeUndefined();
    const reasoned = weekData(
      [week('2026-09-14', 1, { skipped: [{ session_id: 's', starts_at: '2026-09-17T23:30:00Z', series_name: null, reason: 'rain' }] })],
      TZ,
    );
    expect(reasoned[0]!.meta).toMatch(/Thursday called off: rain$/);
    const two = [
      week('2026-09-14', 1, {
        skipped: [
          { session_id: 'a', starts_at: '2026-09-15T23:30:00Z', series_name: null, reason: null },
          { session_id: 'b', starts_at: '2026-09-17T23:30:00Z', series_name: null, reason: null },
        ],
      }),
    ];
    expect(chartCaption(two, TZ)).toBe('The week of Sep 14 had 2 sessions called off (Tuesday and Thursday).');
  });

  it('labels the last column by whether its week has ended', () => {
    const weeks = [week('2026-10-26', 17)];
    expect(lastWeekLabel(weeks, new Date('2026-10-30T12:00:00Z'), TZ)).toBe('THIS WEEK');
    expect(lastWeekLabel(weeks, new Date('2026-11-03T12:00:00Z'), TZ)).toBe('LAST WEEK');
    expect(lastWeekLabel([], new Date(), TZ)).toBe('LAST WEEK');
  });

  it('describes each series', () => {
    const base: HostSeriesInsight = {
      series_id: 's',
      name: 'Tuesday 7-a-side',
      sessions: 4,
      capacity: 14,
      fill_rate: 0.98,
      no_show_rate: 0.03,
      typical_in: 14,
      typical_waitlist: 3,
      median_fill_seconds: 26 * 3600,
      first_timers: 0,
      first_timer_return_rate: null,
    };
    expect(seriesRow(base)).toEqual({
      key: 's',
      name: 'Tuesday 7-a-side',
      pct: 98,
      full: '98% full',
      aria: 'Tuesday 7-a-side, 98 percent full on average',
      meta: 'Fills in about 26 hours · 3% no-shows · 3 on the waitlist most weeks',
    });
    expect(seriesRow({ ...base, fill_rate: 0.84, typical_in: 8, capacity: 10, typical_waitlist: 0, no_show_rate: 0.06 }).meta).toBe(
      'Usually 8 of 10 · 6% no-shows',
    );
    expect(
      seriesRow({ ...base, fill_rate: 0.71, typical_in: null, no_show_rate: null, typical_waitlist: null, first_timers: 10, first_timer_return_rate: 0.4 })
        .meta,
    ).toBe('4 in 10 first-timers come back the next week');
    const none = seriesRow({ ...base, sessions: 0, fill_rate: null, no_show_rate: null, typical_waitlist: null });
    expect(none.full).toBe('No data yet');
    expect(none.pct).toBeNull();
    expect(none.meta).toBe('No sessions in this window');
    expect(none.aria).toBe('Tuesday 7-a-side, no sessions yet');
    expect(aboutDuration(40 * 60)).toBe('about 40 minutes');
    expect(aboutDuration(10)).toBe('about 1 minute');
    expect(aboutDuration(72 * 3600)).toBe('about 3 days');
  });

  it('lists revenue with refunds and the placeholder fee as money out', () => {
    expect(revenueLines(insights().revenue)).toEqual([
      { key: 'drop_in:800', label: 'Drop-ins · 85 × $8', amountCents: 68000 },
      { key: 'refunds', label: 'Refunds', amountCents: -3200 },
      { key: 'fee', label: 'Ojoro service fee', amountCents: -8400, note: 'placeholder' },
    ]);
    const noRefunds = revenueLines({ ...insights().revenue, refunds_cents: 0, lines: [] });
    expect(noRefunds.map((l) => l.key)).toEqual(['fee']);
  });

  it('labels the fee as a placeholder from the server policy', () => {
    const policy = insights().fee_policy;
    expect(feeNote(policy, false)).toBe(
      "The Ojoro service fee is a placeholder (8% of each week's charges) until fees are decided. Payments aren't connected yet, so no money moves; these are records.",
    );
    expect(feeNote({ ...policy, rate_bps: 725 }, true)).toBe(
      "The Ojoro service fee is a placeholder (7.3% of each week's charges) until fees are decided.",
    );
    expect(moneyLocale('CAD')).toBe('en-CA');
    expect(moneyLocale('USD')).toBe('en-US');
  });
});
