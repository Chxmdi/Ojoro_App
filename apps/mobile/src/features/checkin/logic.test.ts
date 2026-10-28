import { describe, expect, it } from 'vitest';

import { row } from '../activities/testFixtures';
import {
  arrivals,
  arrivedLine,
  bothCheckedIn,
  checkInFailure,
  nextLine,
  shareCopy,
  shouldBuzzBothCheckedIn,
} from './logic';

const TZ = 'America/Toronto';
const ojoro = (code: string, detail: string | null = null) =>
  ({ kind: 'ojoro', code, detail }) as Parameters<typeof checkInFailure>[0];

describe('checkInFailure', () => {
  it('handles device problems with a next step', () => {
    expect(checkInFailure('denied', 150)).toEqual({
      message:
        "Check-in needs your location once, to see you're within 150 m of the pitch. We don't keep it. Turn on location for Ojoro, then try again.",
      action: 'OPEN SETTINGS',
    });
    expect(checkInFailure('unavailable', 150).action).toBe('TRY AGAIN');
    expect(checkInFailure('offline', 150)).toEqual({
      message: "You're offline. Check in when you're back online; it needs to see you're here now.",
      action: null,
    });
  });

  it('says how far away you are', () => {
    expect(checkInFailure(ojoro('too_far', '400'), 150)).toEqual({
      message: "You're about 400 m away. Check in when you're within 150 m of the pitch.",
      action: 'TRY AGAIN',
    });
    expect(checkInFailure(ojoro('too_far'), 150).message).toBe(
      "Check in when you're within 150 m of the pitch.",
    );
  });

  it('says when check-in opens', () => {
    expect(checkInFailure(ojoro('check_in_not_open', '2026-10-27 23:00:00+00'), 150, TZ).message).toBe(
      'Check-in opens at 7:00. Come back then.',
    );
    expect(checkInFailure(ojoro('check_in_not_open'), 150).message).toBe("Check-in isn't open yet.");
  });

  it('covers every other answer', () => {
    for (const code of [
      'location_required',
      'check_in_closed',
      'check_in_unavailable',
      'not_attending',
      'activity_cancelled',
      'activity_not_found',
    ]) {
      expect(checkInFailure(ojoro(code), 150).message.length).toBeGreaterThan(10);
    }
    expect(
      checkInFailure({ kind: 'network', code: 'network', detail: null }, 150).action,
    ).toBe('TRY AGAIN');
  });
});

describe('arrivals', () => {
  const roster = [
    row({ user_id: 'ade', display_name: 'Ade B', is_host: true, status: 'checked_in', checked_in_at: '2026-10-27T22:52:00Z' }),
    row({ user_id: 'me', display_name: 'Chimdi O', is_me: true, status: 'checked_in', checked_in_at: '2026-10-27T23:04:00Z' }),
    row({ user_id: 'mt', display_name: 'Marcus T' }),
    row({ user_id: 'td', display_name: 'Tolu D', status: 'checked_in', checked_in_at: '2026-10-27T22:58:00Z' }),
    row({ user_id: 'w', status: 'waitlisted' }),
    row({ user_id: 'nt', status: 'checked_in', checked_in_at: null }),
  ];

  it('lists who has arrived, in order, with times', () => {
    expect(arrivals(roster, TZ).map((a) => [a.name, a.role, a.meta])).toEqual([
      ['Ade B', 'checked', 'Host · 6:52'],
      ['Tolu D', 'checked', '6:58'],
      ['Chimdi O', 'checked', 'You · 7:04'],
      ['Someone S', 'checked', 'Checked in'],
      ['Marcus T', 'in', 'Not checked in yet'],
    ]);
  });

  it('marks you and the host when not in yet', () => {
    const [a] = arrivals([row({ is_me: true, is_host: true })], TZ);
    expect(a?.meta).toBe('Host · You · Not checked in yet');
  });
});

describe('both checked in', () => {
  const host = row({ user_id: 'ade', is_host: true, status: 'checked_in' });
  it('is true when you and the host are both in', () => {
    expect(bothCheckedIn([host, row({ user_id: 'me', is_me: true, status: 'checked_in' })])).toBe(true);
    expect(bothCheckedIn([host, row({ user_id: 'me', is_me: true })])).toBe(false);
    expect(bothCheckedIn([row({ user_id: 'me', is_me: true, is_host: true, status: 'checked_in' })])).toBe(false);
    expect(bothCheckedIn([host])).toBe(false);
  });

  it('buzzes only on the change', () => {
    expect(shouldBuzzBothCheckedIn(false, true)).toBe(true);
    expect(shouldBuzzBothCheckedIn(null, true)).toBe(false);
    expect(shouldBuzzBothCheckedIn(true, true)).toBe(false);
  });
});

describe('copy', () => {
  it('counts arrivals', () => {
    expect(arrivedLine('Jeanne-Mance Park', 6, 8)).toBe('Jeanne-Mance Park. 6 of 8 have arrived.');
    expect(arrivedLine(null, 1, 8)).toBe('1 of 8 has arrived.');
    expect(arrivedLine(null, 1, 1)).toBe('You are the only one in.');
  });

  it('writes the sharing box', () => {
    expect(shareCopy({ expires_at: '2026-10-28T01:30:00Z' }, '2026-10-28T01:00:00Z', TZ)).toBe(
      'Your location is shared with this game only, until 9:30. Then it stops by itself.',
    );
    expect(shareCopy(null, '2026-10-28T01:00:00Z', TZ)).toBe(
      'Running late? Share your location with this game only, until 9:30 at the latest. It stops by itself.',
    );
  });

  it('says who starts the game', () => {
    expect(nextLine('Ade B', false, false)).toBe('Ade starts the game once the teams are set.');
    expect(nextLine(null, false, false)).toBe('The host starts the game once the teams are set.');
    expect(nextLine('Ade B', true, false)).toBe('Start the game once the teams are set.');
    expect(nextLine('Ade B', false, true)).toBe('The game is on.');
  });
});
