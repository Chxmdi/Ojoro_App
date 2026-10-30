import { describe, expect, it } from 'vitest';

import {
  canJoinRun,
  clanHeadline,
  clanInviteText,
  clanOverline,
  clanStats,
  clashBadge,
  clashRow,
  grouped,
  joinState,
  leaderboardLabel,
  leaderboardRow,
  missionBar,
  missionHeadline,
  missionLine,
  missionOverline,
  roleMeta,
  roleWord,
  runStrip,
  upcomingRuns,
  type ClanClashFacts,
  type MissionFacts,
  type RunFacts,
} from './logic';

const TZ = 'America/Toronto';
// Wednesday 28 Oct 2026, 2 PM in Montréal.
const NOW = new Date('2026-10-28T18:00:00Z');

describe('identity', () => {
  it('writes the overline from your role, or how to get in', () => {
    expect(clanOverline({ is_member: true, my_role: 'connector', join_policy: 'request' })).toBe("CLAN · YOU'RE A CONNECTOR");
    expect(clanOverline({ is_member: true, my_role: 'organizer', join_policy: 'request' })).toBe("CLAN · YOU'RE AN ORGANIZER");
    expect(clanOverline({ is_member: true, my_role: 'captain', join_policy: 'open' })).toBe("CLAN · YOU'RE THE CAPTAIN");
    expect(clanOverline({ is_member: true, my_role: 'member', join_policy: 'open' })).toBe("CLAN · YOU'RE IN");
    expect(clanOverline({ is_member: false, my_role: null, join_policy: 'open' })).toBe('CLAN · OPEN TO JOIN');
    expect(clanOverline({ is_member: false, my_role: null, join_policy: 'request' })).toBe('CLAN · ASK TO JOIN');
    expect(clanOverline({ is_member: false, my_role: null, join_policy: 'invite' })).toBe('CLAN · INVITE ONLY');
  });

  it('sets the name and the numbers', () => {
    expect(clanHeadline('Concordia Run Club')).toBe('CONCORDIA RUN CLUB.');
    expect(clanHeadline('Done!')).toBe('DONE!');
    expect(clanStats({ member_count: 212, runs_per_week: 4, coach_count: 3 })).toEqual([
      { value: 212, label: 'Members' },
      { value: 4, label: 'Runs a week' },
      { value: 3, label: 'Coaches' },
    ]);
    expect(clanStats({ member_count: 1, runs_per_week: 1, coach_count: 1 }).map((s) => s.label)).toEqual(['Member', 'Run a week', 'Coach']);
    expect(grouped(1240.4)).toBe('1,240');
    expect(roleWord('coach')).toBe('COACH');
  });

  it('knows what someone outside can do', () => {
    expect(joinState({ is_member: true, join_policy: 'open', request_status: null })).toEqual({ kind: 'member' });
    expect(joinState({ is_member: false, join_policy: 'open', request_status: null })).toEqual({ kind: 'join', label: 'JOIN THE CLAN' });
    expect(joinState({ is_member: false, join_policy: 'request', request_status: 'declined' })).toEqual({ kind: 'join', label: 'ASK TO JOIN' });
    expect(joinState({ is_member: false, join_policy: 'request', request_status: 'pending' })).toEqual({ kind: 'requested' });
    expect(joinState({ is_member: false, join_policy: 'invite', request_status: null })).toEqual({ kind: 'invite' });
  });

  it('shares an invite with the code', () => {
    expect(clanInviteText('Concordia Run Club', 'ABCD2345')).toBe(
      'Join Concordia Run Club on Ojoro with the code ABCD2345: ojoro://clan/join/ABCD2345',
    );
  });
});

describe('this week', () => {
  const run: RunFacts = {
    run_id: 'r1',
    title: 'Tempo · 6 km',
    starts_at: '2026-11-03T23:30:00Z', // Tue 6:30 PM
    place_name: 'Hall building',
    place_area: 'Downtown',
    down_count: 18,
    capacity: 30,
    stage: 'forming',
    i_am_down: false,
  };

  it('reads TUE · Tempo · 6 km · Hall building · 6:30 PM · 18 / 30', () => {
    expect(runStrip(run, NOW, TZ)).toEqual({
      time: 'TUE',
      activity: 'Tempo · 6 km',
      place: 'Hall building · 6:30 PM',
      count: 18,
      capacity: 30,
      status: 'forming',
    });
  });

  it('marks GAME ON, live, full, today and tonight', () => {
    expect(runStrip({ ...run, stage: 'game_on' }, NOW, TZ).status).toBe('confirmed');
    expect(runStrip({ ...run, stage: 'live' }, NOW, TZ).status).toBe('live');
    expect(runStrip({ ...run, down_count: 30 }, NOW, TZ).status).toBe('full');
    expect(runStrip({ ...run, starts_at: '2026-10-28T23:30:00Z' }, NOW, TZ).time).toBe('TONIGHT');
    expect(runStrip({ ...run, starts_at: '2026-10-28T19:00:00Z', place_name: null }, NOW, TZ)).toMatchObject({
      time: 'TODAY',
      place: 'Downtown · 3 PM',
    });
  });

  it('keeps what is ahead, in order', () => {
    const rows = [
      { ...run, run_id: 'b', starts_at: '2026-11-04T23:30:00Z' },
      { ...run, run_id: 'a' },
      { ...run, run_id: 'c', stage: 'cancelled' as const },
      { ...run, run_id: 'd', stage: 'done' as const },
    ];
    expect(upcomingRuns(rows).map((r) => r.run_id)).toEqual(['a', 'b']);
  });

  it("offers I'M DOWN only with room, before it's over", () => {
    expect(canJoinRun(run)).toBe(true);
    expect(canJoinRun({ ...run, i_am_down: true })).toBe(false);
    expect(canJoinRun({ ...run, stage: 'game_on' })).toBe(true);
    expect(canJoinRun({ ...run, stage: 'live' })).toBe(false);
    expect(canJoinRun({ ...run, down_count: 30 })).toBe(false);
  });
});

describe('mission', () => {
  const m: MissionFacts = { metric: 'distance_km', target: 2000, progress: 1240, contributors: 96, my_share: 46, is_done: false };

  it('writes OCTOBER MISSION · 2,000 KM AS A CLAN.', () => {
    expect(missionOverline('2026-10-01')).toBe('OCTOBER MISSION');
    expect(missionOverline('soon')).toBe('MISSION');
    expect(missionHeadline('2,000 km as a clan')).toBe('2,000 KM AS A CLAN.');
    expect(missionHeadline('Go.')).toBe('GO.');
  });

  it('says the totals, then only your share', () => {
    expect(missionLine(m)).toBe('1,240 km so far, from 96 runners. Your share: 46 km.');
    expect(missionLine({ ...m, my_share: null, contributors: 1 })).toBe('1,240 km so far, from 1 runner.');
    expect(missionLine({ ...m, contributors: 0, my_share: null, is_done: true })).toBe('1,240 km done.');
  });

  it('fills whole segments', () => {
    expect(missionBar(m)).toEqual({ value: 6, max: 10, label: '1,240 of 2,000 km' });
    expect(missionBar({ ...m, progress: 3000 }).value).toBe(10);
    expect(missionBar({ ...m, metric: 'runs', progress: 3, target: 20 })).toEqual({ value: 1, max: 10, label: '3 of 20 runs' });
  });
});

describe('the clan Clash row', () => {
  const c: ClanClashFacts = {
    title: 'Fall Clash',
    opponent_name: 'McGill',
    stage: 'live',
    our_wins: 2,
    their_wins: 1,
    event_count: 6,
    decided_count: 3,
    standing: 'leading',
    next_position: 4,
    next_sport_id: 'football',
    next_starts_at: '2026-10-31T13:00:00Z',
  };
  it('reads 2-1 · Fall Clash vs McGill · Event 4 of 6 · football, Sat · LEADING', () => {
    expect(clashRow(c, TZ)).toEqual({
      score: '2-1',
      title: 'Fall Clash vs McGill',
      meta: 'Event 4 of 6 · football, Sat',
      badge: 'LEADING',
      signal: true,
    });
  });
  it('covers the other stages', () => {
    expect(clashRow({ ...c, stage: 'complete' }, TZ).meta).toBe('Finished · 3 of 6 events decided');
    expect(clashRow({ ...c, stage: 'proposed', opponent_name: null }, TZ)).toMatchObject({
      title: 'Fall Clash vs another clan',
      meta: '6 events · waiting on an answer',
      badge: 'PROPOSED',
    });
    expect(clashRow({ ...c, next_position: null }, TZ).meta).toBe('3 of 6 events decided');
    expect(clashRow({ ...c, next_sport_id: null }, TZ).meta).toBe('Event 4 of 6 · next event, Sat');
    expect(clashBadge({ ...c, stage: 'declined' }).badge).toBe('DECLINED');
    expect(clashBadge({ ...c, stage: 'cancelled' }).badge).toBe('CALLED OFF');
    expect(clashBadge({ ...c, stage: 'complete' })).toEqual({ badge: 'WON', signal: true });
    expect(clashBadge({ ...c, stage: 'complete', our_wins: 1, their_wins: 2 }).badge).toBe('LOST');
    expect(clashBadge({ ...c, stage: 'complete', our_wins: 1, their_wins: 1 }).badge).toBe('DRAW');
    expect(clashBadge({ ...c, stage: 'upcoming' }).badge).toBe('UPCOMING');
    expect(clashBadge({ ...c, standing: 'trailing' }).badge).toBe('TRAILING');
    expect(clashBadge({ ...c, standing: 'level' }).badge).toBe('LEVEL');
  });
});

describe('roles and leaderboard', () => {
  it('writes role lines and ranks', () => {
    expect(roleMeta({ is_me: true, role_note: 'welcomes new runners' })).toBe('You · welcomes new runners');
    expect(roleMeta({ is_me: false, role_note: 'Runs the Tuesday tempo' })).toBe('Runs the Tuesday tempo');
    expect(roleMeta({ is_me: false, role_note: null })).toBeUndefined();
    expect(leaderboardLabel(NOW, TZ)).toBe('MOST RUNS · OCTOBER · CLAN ONLY');
    expect(leaderboardRow({ display_name: 'Chimdi O', runs: 11, is_me: true })).toEqual({ name: 'Chimdi O · you', runs: '11 runs' });
    expect(leaderboardRow({ display_name: 'Theo L', runs: 1, is_me: false })).toEqual({ name: 'Theo L', runs: '1 run' });
  });
});
