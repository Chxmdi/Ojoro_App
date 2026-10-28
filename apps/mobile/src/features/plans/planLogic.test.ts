import { describe, expect, it } from 'vitest';

import {
  cancelledSummary,
  candidateReason,
  directionsUrl,
  displayStatus,
  distanceKm,
  distanceLabel,
  expiredSummary,
  firstName,
  formingVariant,
  gameOnNote,
  gameOnOverline,
  icsEvent,
  inviteCaption,
  leaveConfirm,
  lockNote,
  moreLine,
  nextHost,
  pollClosed,
  pollCloses,
  pollModel,
  quotaLine,
  rosterMeta,
  sendLabel,
  sentMessage,
  shouldTakeOver,
  suggestableTimes,
  togglePick,
  waitlistNote,
  waitlistResult,
  wherePrivacyLine,
  type Candidate,
  type RosterRow,
} from './planLogic';

const TZ = 'America/Toronto';
const NOW = new Date('2026-10-28T20:02:00Z');

function row(over: Partial<RosterRow>): RosterRow {
  return {
    user_id: 'u',
    display_name: 'Marcus T',
    avatar_path: null,
    joined_at: '2026-10-28T19:00:00Z',
    is_host: false,
    is_me: false,
    games_with_me: null,
    is_first_game: false,
    hosted_count: 0,
    position: null,
    invited_by_me: false,
    ...over,
  };
}

describe('status', () => {
  const plan = { status: 'forming' as const, effective_status: 'forming' as const, deadline_at: '2026-10-28T22:30:00Z' };

  it('applies the deadline on top of the server status', () => {
    expect(displayStatus(plan, NOW)).toBe('forming');
    expect(displayStatus(plan, new Date('2026-10-28T22:31:00Z'))).toBe('expired');
    expect(displayStatus({ ...plan, effective_status: null, status: 'game_on' }, NOW)).toBe('game_on');
  });

  it('picks the variant', () => {
    expect(formingVariant(7, 8, 'forming')).toBe('need-one-more');
    expect(formingVariant(6, 8, 'forming')).toBe('almost');
    expect(formingVariant(4, 8, 'forming')).toBe('viable');
    expect(formingVariant(2, 8, 'forming')).toBe('early');
    expect(formingVariant(8, 8, 'game_on')).toBe('game-on');
    expect(formingVariant(8, 8, 'forming')).toBe('game-on');
    expect(formingVariant(3, 8, 'expired')).toBe('expired');
    expect(formingVariant(3, 8, 'cancelled')).toBe('expired');
  });

  it('explains the lock', () => {
    expect(lockNote(true, 8)).toBe(
      "You're down, but it's not on yet. The plan locks at 8 and everyone gets GAME ON at the same moment.",
    );
    expect(lockNote(false, 8)).toContain('everyone in gets GAME ON');
  });
});

describe("who's in", () => {
  it('writes the context line from the facts', () => {
    expect(rosterMeta(row({ is_host: true, hosted_count: 40 }))).toBe('Started the plan · 40 games hosted');
    expect(rosterMeta(row({ is_host: true, hosted_count: 1 }))).toBe('Started the plan · 1 game hosted');
    expect(rosterMeta(row({ is_host: true }))).toBe('Started the plan');
    expect(rosterMeta(row({ is_me: true, position: 'Midfield' }))).toBe('You · midfield');
    expect(rosterMeta(row({ is_me: true }))).toBe('You');
    expect(rosterMeta(row({ games_with_me: 12 }))).toBe('12 games with you');
    expect(rosterMeta(row({ games_with_me: 1, invited_by_me: true }))).toBe('joined from your invite · 1 game with you');
    expect(rosterMeta(row({ is_first_game: true }))).toBe('First game');
    expect(rosterMeta(row({}))).toBe('');
  });

  it('summarises the rest', () => {
    expect(moreLine([])).toBeNull();
    expect(moreLine(['Sam K'])).toBe('+ Sam K');
    expect(moreLine(['Sam K', 'Yara M'])).toBe('+ Sam K and Yara M');
    expect(moreLine(['Sam K', 'Yara M', 'Joel P'])).toBe('+ Sam K, Yara M and Joel P');
    expect(moreLine(['A', 'B', 'C', 'D'])).toBe('+ A, B and 2 more');
    expect(moreLine(['A'], 1)).toBe('+ A and 1 more');
    expect(moreLine([], 2)).toBe('+ 2 more');
  });

  it('takes first names', () => {
    expect(firstName('Joel P')).toBe('Joel');
    expect(firstName('  Ife  ')).toBe('Ife');
  });
});

describe('leaving', () => {
  it('asks only when it costs the group', () => {
    expect(leaveConfirm({ count: 2, capacity: 8, isHost: false, nextHost: null })).toBeNull();
    expect(leaveConfirm({ count: 6, capacity: 8, isHost: false, nextHost: null })).toEqual({
      title: 'LEAVE THIS PLAN?',
      body: '6 of 8 are in. Leaving drops it to 5 of 8.',
    });
    expect(leaveConfirm({ count: 2, capacity: 8, isHost: true, nextHost: 'Marcus T' })?.body).toBe(
      '2 of 8 are in. Leaving drops it to 1 of 8. Marcus T hosts it after you.',
    );
    expect(leaveConfirm({ count: 1, capacity: 8, isHost: true, nextHost: null })?.body).toContain('called off');
    expect(leaveConfirm({ count: 3, capacity: 8, isHost: true, nextHost: null })?.body).toContain(
      'The next person in hosts it',
    );
  });

  it('finds the next host', () => {
    expect(
      nextHost([
        row({ is_host: true, display_name: 'Ade B', joined_at: '2026-10-28T10:00:00Z' }),
        row({ display_name: 'Lena R', joined_at: '2026-10-28T12:00:00Z' }),
        row({ display_name: 'Marcus T', joined_at: '2026-10-28T11:00:00Z' }),
      ]),
    ).toBe('Marcus T');
    expect(nextHost([row({ is_host: true })])).toBeNull();
  });
});

describe('time poll', () => {
  const options = [
    { id: 'b', starts_at: '2026-10-29T00:00:00Z', vote_count: 2 },
    { id: 'a', starts_at: '2026-10-28T23:30:00Z', vote_count: 4 },
  ];

  it('orders options by time and finds your vote', () => {
    expect(pollModel(options, 'a', TZ)).toEqual({
      options: [
        { label: '7:30', votes: 4 },
        { label: '8:00', votes: 2 },
      ],
      voted: 0,
      ids: ['a', 'b'],
    });
    expect(pollModel(options, null, TZ).voted).toBeUndefined();
  });

  it('closes at the poll time or deadline, and when not forming', () => {
    const plan = { poll_closes_at: '2026-10-28T22:00:00Z', deadline_at: '2026-10-28T22:30:00Z' };
    expect(pollClosed(plan, 'forming', NOW)).toBe(false);
    expect(pollClosed(plan, 'forming', new Date('2026-10-28T22:00:00Z'))).toBe(true);
    expect(pollClosed(plan, 'game_on', NOW)).toBe(true);
    expect(pollClosed({ ...plan, poll_closes_at: null }, 'forming', new Date('2026-10-28T22:10:00Z'))).toBe(false);
    expect(pollCloses(plan, NOW, TZ)).toBe('at 6:00');
    expect(pollCloses({ ...plan, poll_closes_at: null }, NOW, TZ)).toBe('at 6:30');
  });

  it('suggests half-hour times around the start that are still to come and not offered', () => {
    const out = suggestableTimes('2026-10-28T23:30:00Z', ['2026-10-29T00:00:00Z'], NOW);
    expect(out).toEqual([
      '2026-10-28T22:00:00.000Z',
      '2026-10-28T22:30:00.000Z',
      '2026-10-28T23:00:00.000Z',
      '2026-10-29T00:30:00.000Z',
      '2026-10-29T01:00:00.000Z',
      '2026-10-29T01:30:00.000Z',
    ]);
    expect(suggestableTimes('2026-10-28T20:30:00Z', [], NOW)).not.toContain('2026-10-28T20:00:00.000Z');
  });
});

describe('place', () => {
  it('measures distance', () => {
    expect(distanceKm({ lat: 45.52, lng: -73.58 }, { lat: 45.5155, lng: -73.5878 })).toBeCloseTo(0.8, 1);
    expect(distanceLabel(1.2)).toBe('1.2 km');
    expect(distanceLabel(null)).toBeUndefined();
  });

  it('keeps the exact pitch for members', () => {
    expect(wherePrivacyLine('Ade B')).toBe('Proposed by Ade. The exact pitch is shared with people in the plan only.');
    expect(wherePrivacyLine(null)).toBe('The exact pitch is shared with people in the plan only.');
  });
});

describe('expired, full and waitlist', () => {
  it('never blames', () => {
    expect(expiredSummary(3, 8)).toBe('3 of 8 by the deadline. Nobody was charged or marked as a no-show.');
    expect(cancelledSummary()).toContain('called it off');
  });

  it('writes the waitlist offer and result', () => {
    expect(waitlistNote(2, '2026-10-28T23:00:00Z', TZ)).toBe(
      "2 people ahead of you. If a spot opens before 7:00 you're in automatically.",
    );
    expect(waitlistNote(1, null, TZ)).toBe("1 person ahead of you. If a spot opens you're in automatically.");
    expect(waitlistNote(0, null, TZ)).toContain('Nobody ahead of you.');
    expect(waitlistResult({ status: 'confirmed', waitlist_position: null })).toBe("A spot was free. You're in.");
    expect(waitlistResult({ status: 'waitlisted', waitlist_position: 1 })).toBe("You're first on the waitlist.");
    expect(waitlistResult({ status: 'waitlisted', waitlist_position: 3 })).toBe(
      "You're on the waitlist. 2 people ahead of you.",
    );
    expect(waitlistResult({ status: 'waitlisted', waitlist_position: null })).toBe("You're first on the waitlist.");
  });
});

describe('GAME ON', () => {
  const roster = [
    { display_name: 'Ade B', joined_at: '2026-10-28T10:00:00Z', is_me: false },
    { display_name: 'Joel P', joined_at: '2026-10-28T20:01:00Z', is_me: false },
  ];

  it('says who made it, just now', () => {
    expect(gameOnOverline(roster, 8, NOW)).toBe('JUST NOW · JOEL MADE IT 8');
    expect(gameOnOverline([{ ...roster[1]!, is_me: true }], 8, NOW)).toBe('JUST NOW · YOU MADE IT 8');
    expect(gameOnOverline(roster, 8, new Date('2026-10-28T21:00:00Z'))).toBeNull();
    expect(gameOnOverline([], 8, NOW)).toBeNull();
  });

  it('writes the same-moment note', () => {
    expect(gameOnNote(8, '2026-10-28T23:00:00Z', TZ)).toBe('All 8 got this at the same moment. Check-in opens at 7:00.');
    expect(gameOnNote(3, null, TZ)).toBe('All 3 got this at the same moment.');
  });

  it('takes over only on a forming → game on change for people in', () => {
    expect(shouldTakeOver('forming', 'game_on', true)).toBe(true);
    expect(shouldTakeOver(undefined, 'game_on', true)).toBe(false);
    expect(shouldTakeOver('game_on', 'game_on', true)).toBe(false);
    expect(shouldTakeOver('forming', 'game_on', false)).toBe(false);
    expect(shouldTakeOver('forming', 'expired', true)).toBe(false);
  });
});

describe('pull someone in', () => {
  const c: Candidate = {
    user_id: 'j',
    display_name: 'Joel P',
    games_with_me: 6,
    pull_me_in: true,
    free_at_plan_time: true,
    plays_sport: true,
    already_invited: false,
  };

  it('writes a reason from the facts', () => {
    expect(candidateReason(c, 'Football', 'Tonight')).toBe(
      '6 games with you · Pull Me In is on for football · free tonight',
    );
    expect(
      candidateReason({ ...c, games_with_me: 1, pull_me_in: false, free_at_plan_time: false }, 'Football', 'Tonight'),
    ).toBe('1 game with you · plays football');
    expect(
      candidateReason(
        { ...c, games_with_me: null, pull_me_in: false, plays_sport: false, free_at_plan_time: false, already_invited: true },
        'Football',
        'Tonight',
      ),
    ).toBe('invited');
  });

  it('shows the quota, the send label and the privacy promise', () => {
    expect(quotaLine(3, 3)).toBe(
      "Ranked by who's most likely to say yes. You can send 3 more invites for this plan.",
    );
    expect(quotaLine(1, 3)).toContain('1 more invite for');
    expect(quotaLine(0, 3)).toBe("You've sent your 3 invites for this plan.");
    expect(sendLabel(0)).toBe('PICK SOMEONE');
    expect(sendLabel(1)).toBe('SEND 1 INVITE');
    expect(sendLabel(2)).toBe('SEND 2 INVITES');
    expect(inviteCaption(['Joel P'])).toBe("Joel sees who's in, the time and the place. Nothing else.");
    expect(inviteCaption(['Joel P', 'Ife N'])).toBe("They see who's in, the time and the place. Nothing else.");
    expect(inviteCaption([])).toBe("Anyone you pull in sees who's in, the time and the place. Nothing else.");
    expect(sentMessage(1, ['Joel P'])).toBe("Invite sent. Joel sees who's in, the time and the place. Nothing else.");
    expect(sentMessage(2, ['Joel P', 'Ife N'])).toContain('2 invites sent');
    expect(sentMessage(0, ['Joel P'])).toContain('already invited');
  });

  it('picks within the quota', () => {
    expect(togglePick([], 'a', 3)).toEqual(['a']);
    expect(togglePick(['a'], 'a', 3)).toEqual([]);
    expect(togglePick(['a', 'b'], 'c', 2)).toEqual(['a', 'b']);
  });
});

describe('calendar and directions', () => {
  it('writes an iCalendar event', () => {
    const ics = icsEvent({
      uid: 'p1',
      title: 'Football, Jeanne-Mance Park',
      startsAt: '2026-10-28T23:30:00Z',
      durationMinutes: 90,
      location: 'Jeanne-Mance Park; north pitch',
      now: NOW,
    });
    expect(ics).toContain('DTSTART:20261028T233000Z');
    expect(ics).toContain('DTEND:20261029T010000Z');
    expect(ics).toContain('SUMMARY:Football\\, Jeanne-Mance Park');
    expect(ics).toContain('LOCATION:Jeanne-Mance Park\\; north pitch');
    expect(icsEvent({ uid: 'p', title: 'a\\b\nc', startsAt: '2026-10-28T23:30:00Z', durationMinutes: 60, location: null, now: NOW })).not.toContain('LOCATION');
  });

  it('hands off to the device maps', () => {
    const to = { lat: 45.5, lng: -73.6, label: 'North pitch' };
    expect(directionsUrl('ios', to)).toBe('http://maps.apple.com/?daddr=45.5,-73.6&q=North%20pitch');
    expect(directionsUrl('android', to)).toBe('geo:45.5,-73.6?q=45.5,-73.6(North%20pitch)');
    expect(directionsUrl('web', { ...to, label: null })).toBe('https://maps.apple.com/?daddr=45.5,-73.6&q=Meeting%20point');
    expect(directionsUrl('web', { lat: null, lng: null, label: null })).toBeNull();
  });
});
