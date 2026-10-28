import { describe, expect, it } from 'vitest';

import {
  activityName,
  canCancel,
  cancelBody,
  checkInCta,
  detailItems,
  displayName,
  finishedLine,
  joinOffer,
  myAttendance,
  overflowLine,
  playingRows,
  statusOf,
  waitlistLine,
  whoTitle,
} from './model';
import { card, row } from './testFixtures';

const TZ = 'America/Toronto';

const NOON = new Date('2026-10-27T16:00:00Z');
const AT_705 = new Date('2026-10-27T23:05:00Z');

describe('attendance and status', () => {
  it('maps my attendance', () => {
    expect(myAttendance({ my_attendance: 'checked_in' })).toBe('checked-in');
    expect(myAttendance({ my_attendance: 'confirmed' })).toBe('player');
    expect(myAttendance({ my_attendance: 'waitlisted' })).toBe('waitlisted');
    expect(myAttendance({ my_attendance: 'cancelled' })).toBe('out');
    expect(myAttendance({ my_attendance: null })).toBe('out');
  });

  it('computes the status from the times', () => {
    expect(statusOf(card(), NOON)).toBe('confirmed');
    expect(statusOf(card(), new Date('2026-10-27T23:40:00Z'))).toBe('live');
    expect(statusOf(card(), new Date('2026-10-28T02:00:00Z'))).toBe('after');
    expect(statusOf(card(), new Date('2026-10-29T02:00:00Z'))).toBe('complete');
    expect(statusOf(card({ status: 'cancelled' }), NOON)).toBe('cancelled');
    expect(statusOf(card({ effective_status: 'cancelled' }), NOON)).toBe('cancelled');
    expect(statusOf(card({ status: 'complete' }), NOON)).toBe('complete');
    // The host started early or blew FULL TIME.
    expect(statusOf(card({ live_at: '2026-10-27T15:00:00Z' }), NOON)).toBe('live');
    expect(statusOf(card({ ended_at: '2026-10-27T15:30:00Z' }), NOON)).toBe('after');
    expect(statusOf(card({ effective_status: 'live' }), NOON)).toBe('live');
  });

  it('names the activity', () => {
    expect(activityName({ title: 'Pickup football', sport_name: 'Football' })).toBe('Pickup football');
    expect(activityName({ title: '  ', sport_name: 'Football' })).toBe('Football');
    expect(activityName({ title: null, sport_name: 'Football' })).toBe('Football');
  });
});

describe('details', () => {
  it('lists teams, kit, cost and attendance, and the meeting point for players', () => {
    expect(detailItems(card(), 'North pitch, by the lights')).toEqual([
      { label: 'TEAMS', value: 'Lights vs Darks. Bring both shirts.' },
      { label: 'KIT', value: 'Ball and bibs: Ade. Turf boots.' },
      { label: 'COST', value: 'Free' },
      { label: 'ATTENDANCE', value: 'Check-in at the pitch. Host confirms.' },
      { label: 'MEET AT', value: 'North pitch, by the lights' },
    ]);
  });

  it('builds teams from labels and skips what is missing', () => {
    const items = detailItems(card({ teams_note: null, kit_note: null }), null);
    expect(items.map((i) => i.label)).toEqual(['TEAMS', 'COST', 'ATTENDANCE']);
    expect(items[0]?.value).toBe('Lights vs Darks.');
    expect(detailItems(card({ teams_note: null, team_a_label: null }), null)[0]?.label).toBe('KIT');
  });
});

describe('who is playing', () => {
  const roster = [
    row({ user_id: 'ade', display_name: 'Ade B', is_host: true, team: 'a', status: 'checked_in' }),
    row({ user_id: 'me', display_name: 'Chimdi O', is_me: true, team: 'b' }),
    row({ user_id: 'mt', display_name: 'Marcus T', team: 'a', games_with_me: 12 }),
    row({ user_id: 'jp', display_name: 'Joel P', team: 'b', invited_by_me: true }),
    row({ user_id: 'lr', display_name: 'Lena R', games_with_me: 1 }),
    row({ user_id: 'w', display_name: 'Wait L', status: 'waitlisted' }),
    row({ user_id: 'x', display_name: null }),
  ];

  it('writes roles and the context line', () => {
    const rows = playingRows(card(), roster);
    expect(rows.map((r) => [r.name, r.role, r.meta])).toEqual([
      ['Ade B', 'host', 'Host · Lights'],
      ['Chimdi O', 'in', 'You · Darks'],
      ['Marcus T', 'in', 'Lights · 12 games with you'],
      ['Joel P', 'in', 'Darks · joined from your invite'],
      ['Lena R', 'in', '1 game with you'],
      ['Someone', 'in', ''],
    ]);
    expect(rows[0]?.checkedIn).toBe(true);
  });

  it('marks checked-in players and falls back on team names', () => {
    const rows = playingRows(card({ team_a_label: null, team_b_label: null }), [
      row({ status: 'checked_in', team: 'a', checked_in_at: '2026-10-27T23:04:00Z' }),
      row({ team: 'b' }),
    ]);
    expect(rows.map((r) => [r.role, r.meta])).toEqual([
      ['checked', 'Team A'],
      ['in', 'Team B'],
    ]);
  });

  it('writes the overflow line', () => {
    const rows = playingRows(card(), roster);
    expect(overflowLine(rows.slice(4), 2)).toBe('+ Lena and Someone · 2 on the waitlist');
    expect(overflowLine([], 2)).toBe('2 on the waitlist');
    expect(overflowLine(rows.slice(4, 5), 0)).toBe('+ Lena');
    expect(overflowLine([], 0)).toBeNull();
    expect(whoTitle(card({ confirmed_count: 7 }))).toBe("WHO'S PLAYING · 7 OF 8");
    expect(displayName({ display_name: ' ' })).toBe('Someone');
  });
});

describe('check in', () => {
  it('says when check-in opens', () => {
    expect(checkInCta(card(), NOON, TZ)).toEqual({
      kind: 'early',
      hint: "Opens at 7:00 when you're within 150 m of the pitch.",
    });
  });

  it('is open in the window, done when checked in, absent otherwise', () => {
    expect(checkInCta(card(), AT_705, TZ).kind).toBe('open');
    expect(checkInCta(card({ my_attendance: 'checked_in' }), AT_705, TZ)).toEqual({
      kind: 'done',
      hint: "You're checked in.",
    });
    expect(checkInCta(card({ my_attendance: 'waitlisted' }), AT_705, TZ).kind).toBe('none');
    expect(checkInCta(card(), new Date('2026-10-28T02:00:00Z'), TZ).kind).toBe('none');
    // Live, window still open until the end.
    expect(checkInCta(card(), new Date('2026-10-28T00:00:00Z'), TZ).kind).toBe('open');
    // Closed window while still live (host extended nothing): none.
    expect(
      checkInCta(card({ check_in_closes_at: '2026-10-27T23:50:00Z' }), new Date('2026-10-28T00:00:00Z'), TZ).kind,
    ).toBe('none');
  });
});

describe('cancel and waitlist', () => {
  it('offers cancelling until the start, to people not yet checked in', () => {
    expect(canCancel(card(), NOON)).toBe(true);
    expect(canCancel(card({ my_attendance: 'checked_in' }), NOON)).toBe(false);
    expect(canCancel(card(), new Date('2026-10-27T23:40:00Z'))).toBe(false);
  });

  it('says where the spot goes', () => {
    expect(cancelBody(card(), NOON)).toBe(
      "8 of 8 are in. Your spot goes to the first person on the waitlist. To get back in, you'd join the waitlist.",
    );
    expect(cancelBody(card(), AT_705)).toContain('Your spot opens for someone else.');
    expect(cancelBody(card({ waitlist_count: 0 }), NOON)).toContain('Your spot opens for someone else.');
  });

  it('offers a free spot or the waitlist to people who are out', () => {
    expect(joinOffer(card(), NOON, TZ)).toBeNull();
    const out = card({ my_attendance: null });
    expect(joinOffer(out, NOON, TZ)).toEqual({
      label: 'JOIN WAITLIST',
      body: "2 people on the waitlist. If a spot opens before 7:00 you're in automatically.",
    });
    expect(joinOffer({ ...out, waitlist_count: 1 }, NOON, TZ)?.body).toMatch(/^1 person on/);
    expect(joinOffer({ ...out, waitlist_count: 0 }, NOON, TZ)?.body).toMatch(/^Nobody on/);
    expect(joinOffer({ ...out, waitlist_count: 0 }, AT_705, TZ)?.body).toContain('Check-in has opened');
    expect(joinOffer({ ...out, confirmed_count: 7 }, NOON, TZ)).toEqual({
      label: 'TAKE THE SPOT',
      body: "1 spot is open. Tap and you're in.",
    });
    expect(joinOffer({ ...out, confirmed_count: 5 }, NOON, TZ)?.body).toBe("3 spots are open. Tap and you're in.");
    expect(joinOffer({ ...out, confirmed_count: 7 }, AT_705, TZ)?.label).toBe('JOIN WAITLIST');
    expect(joinOffer(out, new Date('2026-10-27T23:40:00Z'), TZ)).toBeNull();
  });

  it('says where you are on the waitlist', () => {
    const c = card({ my_attendance: 'waitlisted' });
    expect(waitlistLine(c, 3, NOON, TZ)).toBe(
      "2 people ahead of you. If a spot opens before 7:00 you're in automatically.",
    );
    expect(waitlistLine(c, 2, NOON, TZ)).toMatch(/^1 person ahead/);
    expect(waitlistLine(c, 1, NOON, TZ)).toMatch(/^You're next\./);
    expect(waitlistLine(c, null, AT_705, TZ)).toBe(
      "You're on the waitlist. 2 on it. Check-in has opened, so spots no longer move to the waitlist.",
    );
  });
});

describe('finished games', () => {
  it('says what happened', () => {
    expect(finishedLine(card(), 'cancelled', TZ)).toMatch(/called this game off/);
    expect(finishedLine(card(), 'after', TZ)).toBe(
      'The game has ended. Confirm the score and add photos until Wed 9 PM.',
    );
    expect(finishedLine(card(), 'complete', TZ)).toMatch(/recap stays/);
  });
});
