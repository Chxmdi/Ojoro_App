import { describe, expect, it } from 'vitest';

import {
  canJoinDownFor,
  canSkipWeek,
  chatButtonLabel,
  chatIconLabel,
  communityRows,
  downForMeta,
  downForTitle,
  endsWords,
  firstName,
  freeTonightLine,
  isoDayName,
  joinNames,
  localClock,
  memoryCaption,
  nextLine,
  ritualHeadline,
  ritualLine,
  ritualSuggestion,
  ritualWeek,
  sportWord,
  suggestionTitle,
  versusBadge,
  versusRow,
  windowWords,
  type RitualFacts,
} from './homeLogic';

const TZ = 'America/Toronto';
// Wednesday 28 Oct 2026, 2 PM in Montréal.
const NOW = new Date('2026-10-28T18:00:00Z');

describe('names and words', () => {
  it('takes first names and sport words', () => {
    expect(firstName('Ade B')).toBe('Ade');
    expect(firstName('  ')).toBe('Someone');
    expect(firstName(null)).toBe('Someone');
    expect(sportWord('ultimate_frisbee')).toBe('Ultimate frisbee');
    expect(sportWord(null)).toBe('A game');
  });

  it('joins names with and', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['Ade'])).toBe('Ade');
    expect(joinNames(['Ade', 'Lena'])).toBe('Ade and Lena');
    expect(joinNames(['Ade', 'Lena', 'Joel', 'Sam'])).toBe('Ade, Lena, Joel and Sam');
  });
});

describe('freeTonightLine', () => {
  it('names up to four, then counts the rest, never a time slot', () => {
    expect(freeTonightLine(['Ade B', 'Lena R', 'Joel P', 'Sam K'], 4)).toBe('Ade, Lena, Joel and Sam are free this evening.');
    expect(freeTonightLine(['Ade B', 'Lena R', 'Joel P', 'Sam K', 'Mo T'], 6)).toBe('Ade, Lena, Joel, Sam and 2 more are free this evening.');
    expect(freeTonightLine(['Ade B'], 1)).toBe('Ade is free this evening.');
    expect(freeTonightLine([], 3)).toBe('3 crew mates are free this evening.');
    expect(freeTonightLine([], 1)).toBe('1 crew mate is free this evening.');
    expect(freeTonightLine([], 0)).toBeNull();
  });
});

describe('Down For board', () => {
  const row = {
    display_name: 'Lena R',
    sport_id: 'football',
    sport_name: 'Football',
    window_start: '2026-10-31T13:00:00Z', // Sat 9 AM
    expires_at: '2026-10-31T02:00:00Z', // Fri 10 PM
    down_count: 3,
    i_am_down: false,
    is_mine: false,
  };

  it('writes the window and who started it', () => {
    expect(downForTitle(row, NOW, TZ)).toBe('Football, Saturday morning');
    expect(downForMeta(row, NOW, TZ)).toBe('Lena · 3 down · ends Fri 10 PM');
    expect(downForMeta({ ...row, is_mine: true }, NOW, TZ)).toBe('You · 3 down · ends Fri 10 PM');
    expect(downForTitle({ ...row, sport_name: null, sport_id: 'running' }, NOW, TZ)).toBe('Running, Saturday morning');
  });

  it('words windows near and far', () => {
    expect(windowWords('2026-10-28T23:00:00Z', NOW, TZ)).toBe('tonight');
    expect(windowWords('2026-10-28T16:00:00Z', NOW, TZ)).toBe('this afternoon');
    expect(windowWords('2026-10-29T12:00:00Z', NOW, TZ)).toBe('tomorrow morning');
    expect(windowWords('2026-11-10T23:00:00Z', NOW, TZ)).toBe('Tue 10 Nov, evening');
    expect(endsWords('2026-10-29T03:00:00Z', NOW, TZ)).toBe('tonight 11 PM');
    expect(endsWords('2026-10-28T19:00:00Z', NOW, TZ)).toBe('today 3 PM');
    expect(endsWords('2026-10-29T13:00:00Z', NOW, TZ)).toBe('tomorrow 9 AM');
  });

  it("hides I'M DOWN on your own and once you're in", () => {
    expect(canJoinDownFor(row)).toBe(true);
    expect(canJoinDownFor({ ...row, is_mine: true })).toBe(false);
    expect(canJoinDownFor({ ...row, i_am_down: true })).toBe(false);
  });
});

describe('nextLine', () => {
  it('reads Football · Thu 7:30 · Jeanne-Mance', () => {
    const home = {
      next_plan_id: 'p',
      next_title: null,
      next_sport_id: 'football',
      next_starts_at: '2026-10-29T23:30:00Z',
      next_place_name: 'Jeanne-Mance',
    };
    expect(nextLine(home, NOW, TZ)).toBe('Football · Tomorrow 7:30 · Jeanne-Mance');
    expect(nextLine({ ...home, next_starts_at: '2026-10-31T13:00:00Z', next_title: 'Saturday kick' }, NOW, TZ)).toBe(
      'Saturday kick · Sat 9:00 · Jeanne-Mance',
    );
    expect(nextLine({ ...home, next_starts_at: '2026-10-28T23:30:00Z' }, NOW, TZ)).toBe('Football · Tonight 7:30 · Jeanne-Mance');
    expect(nextLine({ ...home, next_starts_at: '2026-10-28T19:00:00Z' }, NOW, TZ)).toBe('Football · Today 3:00 · Jeanne-Mance');
    expect(nextLine({ ...home, next_starts_at: '2026-11-12T23:30:00Z', next_place_name: null }, NOW, TZ)).toBe('Football · Thu 12 Nov 6:30');
    expect(nextLine({ ...home, next_plan_id: null }, NOW, TZ)).toBeNull();
  });
});

describe('Rituals', () => {
  const ritual: RitualFacts = {
    title: 'Thursday football',
    day_of_week: 4,
    local_time: '19:30:00',
    place_name: 'Jeanne-Mance',
    status: 'active',
    lead_days: 6,
    week_starts_at: '2026-10-29T23:30:00Z',
    week_skipped: false,
    week_plan_id: 'plan-1',
    week_member_count: 6,
    week_capacity: 10,
    can_edit: false,
    host_id: 'host',
  };

  it('writes the card', () => {
    expect(ritualHeadline(ritual)).toBe('THURSDAY FOOTBALL.');
    expect(ritualHeadline({ title: 'Go.' })).toBe('GO.');
    expect(ritualLine(ritual)).toBe("Every Thursday, 7:30, Jeanne-Mance. Prefilled each week; everyone still taps I'M DOWN.");
    expect(ritualLine({ ...ritual, status: 'paused', place_name: null })).toBe(
      "Every Thursday, 7:30. Paused: nothing goes on the board until it's back on.",
    );
    expect(localClock('07:05:00')).toBe('7:05');
    expect(localClock('00:00')).toBe('12:00');
    expect(localClock('later')).toBe('later');
    expect(isoDayName(7)).toBe('Sunday');
  });

  it("knows this week's state", () => {
    expect(ritualWeek(ritual, TZ)).toEqual({ kind: 'plan', planId: 'plan-1', label: 'THIS WEEK · 6 / 10' });
    expect(ritualWeek({ ...ritual, week_capacity: null }, TZ)).toEqual({ kind: 'plan', planId: 'plan-1', label: 'THIS WEEK · 6 IN' });
    expect(ritualWeek({ ...ritual, status: 'paused' }, TZ)).toEqual({ kind: 'paused' });
    expect(ritualWeek({ ...ritual, week_skipped: true }, TZ)).toEqual({ kind: 'skipped', label: 'Skipped Thu 29 Oct. The week after is on.' });
    expect(ritualWeek({ ...ritual, week_plan_id: null }, TZ)).toEqual({ kind: 'later', label: 'On the board from Fri 23 Oct.' });
  });

  it('lets editors and the host skip', () => {
    expect(canSkipWeek(ritual, 'me')).toBe(false);
    expect(canSkipWeek(ritual, 'host')).toBe(true);
    expect(canSkipWeek({ ...ritual, can_edit: true }, null)).toBe(true);
    expect(canSkipWeek({ ...ritual, can_edit: true, week_skipped: true }, null)).toBe(false);
    expect(canSkipWeek({ ...ritual, can_edit: true, status: 'paused' }, null)).toBe(false);
  });

  it('suggests a Ritual from the facts', () => {
    const facts = {
      suggest_sport_id: 'football',
      suggest_day_of_week: 4,
      suggest_local_time: '19:30:00',
      suggest_place_name: 'Jeanne-Mance',
      suggest_weeks: 3,
    };
    expect(ritualSuggestion(facts)).toEqual({
      title: 'THURSDAY FOOTBALL.',
      body: "Football on Thursdays at 7:30, Jeanne-Mance. 3 of the last 5 weeks. Make it a Ritual and the plan goes on the board each week; everyone still taps I'M DOWN.",
    });
    expect(ritualSuggestion({ ...facts, suggest_place_name: null, suggest_weeks: null })?.body).toBe(
      "Football on Thursdays at 7:30. Make it a Ritual and the plan goes on the board each week; everyone still taps I'M DOWN.",
    );
    expect(ritualSuggestion({ ...facts, suggest_sport_id: null })).toBeNull();
    expect(suggestionTitle(facts)).toBe('Thursday football');
  });
});

describe('crew vs crew', () => {
  const v = {
    opponent_name: 'Plateau Crew',
    side_size: 5,
    starts_at: '2026-11-01T14:00:00Z',
    time_zone: TZ,
    place_name: 'Jeanne-Mance',
    stage: 'days',
    in_count: 9,
    needed: 10,
    our_value: null,
    their_value: null,
    outcome: null,
  };
  it('reads SUN · vs Plateau Crew · 5 a side · Jeanne-Mance · 9 of 10 in · ACCEPTED', () => {
    expect(versusRow(v, NOW)).toEqual({
      day: 'SUN',
      title: 'vs Plateau Crew',
      meta: '5 a side · Jeanne-Mance · 9 of 10 in',
      badge: 'ACCEPTED',
      signal: false,
    });
  });
  it('shows the score once complete, and a date when far', () => {
    const done = { ...v, stage: 'complete', our_value: 5, their_value: 4, outcome: 'won', starts_at: '2026-10-11T14:00:00Z', opponent_name: null };
    expect(versusRow(done, NOW)).toEqual({ day: '11 OCT', title: 'vs another crew', meta: '5 a side · Jeanne-Mance · 5–4', badge: 'WON', signal: true });
    expect(versusRow({ ...done, our_value: null }, NOW).meta).toBe('5 a side · Jeanne-Mance');
  });
  it('maps every stage to a word', () => {
    expect(versusBadge('today', null).badge).toBe('TODAY');
    expect(versusBadge('soon', null).badge).toBe('TODAY');
    expect(versusBadge('live', null)).toEqual({ badge: 'LIVE', signal: true });
    expect(versusBadge('verifying', null).badge).toBe('VERIFYING');
    expect(versusBadge('disputed', null).badge).toBe('DISPUTED');
    expect(versusBadge('cancelled', null).badge).toBe('CALLED OFF');
    expect(versusBadge('complete', 'lost').badge).toBe('LOST');
    expect(versusBadge('complete', 'draw').badge).toBe('DRAW');
    expect(versusBadge('accepted', null).badge).toBe('ACCEPTED');
  });
});

describe('memories and chat', () => {
  const m = {
    occurred_at: '2026-10-06T23:30:00Z',
    sport_id: 'football',
    team_a_label: 'Lights',
    team_b_label: 'Darks',
    team_a_score: 5,
    team_b_score: 4,
    played_count: 10,
  };
  it('captions a memory', () => {
    expect(memoryCaption(m, TZ)).toBe('Lights win 5–4 · 6 Oct');
    expect(memoryCaption({ ...m, team_a_score: 2 }, TZ)).toBe('Darks win 4–2 · 6 Oct');
    expect(memoryCaption({ ...m, team_a_score: 4 }, TZ)).toBe('Draw 4–4 · 6 Oct');
    expect(memoryCaption({ ...m, team_a_label: null }, TZ)).toBe('5–4 · 6 Oct');
    expect(memoryCaption({ ...m, team_a_score: null }, TZ)).toBe('Football · 10 played · 6 Oct');
  });
  it('labels the chat', () => {
    expect(chatButtonLabel(4)).toBe('OPEN CREW CHAT · 4 NEW');
    expect(chatButtonLabel(0)).toBe('OPEN CREW CHAT');
    expect(chatButtonLabel(120)).toBe('OPEN CREW CHAT · 99+ NEW');
    expect(chatIconLabel(4)).toBe('Crew chat, 4 new');
    expect(chatIconLabel(0)).toBe('Crew chat');
  });
});

describe('communityRows', () => {
  it('lists crews, clans and programs in that order', () => {
    const rows = communityRows({
      crews: [
        { crew_id: 'c1', name: 'Thursday FC', member_count: 14, role: 'admin' },
        { crew_id: 'c2', name: 'Two', member_count: 1, role: 'owner' },
        { crew_id: 'c3', name: 'Three', member_count: 3, role: 'member' },
      ],
      clans: [
        { clan_id: 'k1', name: 'Concordia Run Club', member_count: 212, role: 'connector' },
        { clan_id: 'k2', name: 'Plain', member_count: 9, role: 'member' },
      ],
      programs: [
        { id: 'h1', name: 'Plateau Pickup', role: 'co_host', upcoming_sessions: 3, pending_requests: 2 },
        { id: 'h2', name: 'Mine', role: 'owner', upcoming_sessions: 1, pending_requests: 0 },
      ],
    });
    expect(rows.map((r) => r.key)).toEqual(['crew-c1', 'crew-c2', 'crew-c3', 'clan-k1', 'clan-k2', 'host-h1', 'host-h2']);
    expect(rows[0]).toMatchObject({ count: 14, countLabel: '14 members', meta: 'Crew · admin', badge: 'CREW', href: '/crew/c1' });
    expect(rows[1]).toMatchObject({ countLabel: '1 member', meta: 'Crew · you own it' });
    expect(rows[2]?.meta).toBe('Crew');
    expect(rows[3]).toMatchObject({ meta: 'Clan · connector role', badge: 'CLAN', href: '/clan/k1' });
    expect(rows[4]?.meta).toBe('Clan');
    expect(rows[5]).toMatchObject({
      count: 3,
      countLabel: '3 sessions in the next 7 days',
      meta: 'Host tools · you co-host · 3 sessions this week · 2 requests waiting',
      badge: 'CO-HOST',
      href: '/host/h1',
    });
    expect(rows[6]).toMatchObject({ meta: 'Host tools · you run it · 1 session this week', badge: 'HOST' });
  });
});
