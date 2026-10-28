/**
 * Check-in rules the screens need: what a failed check-in says and what to do next, the arrivals
 * list, the both-checked-in moment and the location-sharing copy. Pure, so it runs in Node.
 */
import type { OjoroError } from '@ojoro/contracts';

import { clock, firstName } from '../activities/format';
import { displayName, type RosterRow } from '../activities/model';

/** Why we couldn't get a position before calling the server. */
export type LocationProblem = 'denied' | 'unavailable' | 'offline';

export type CheckInFailure = {
  /** What happened, in words. Shown with the alert icon. */
  message: string;
  /** The one next step, as a button label, or null when there's nothing to tap. */
  action: 'TRY AGAIN' | 'OPEN SETTINGS' | null;
};

/** Words for a check-in that didn't happen, from a device problem or a server answer. */
export function checkInFailure(
  problem: LocationProblem | OjoroError,
  radiusM: number,
  timeZone?: string,
): CheckInFailure {
  if (typeof problem === 'string') {
    switch (problem) {
      case 'denied':
        return {
          message: `Check-in needs your location once, to see you're within ${radiusM} m of the pitch. We don't keep it. Turn on location for Ojoro, then try again.`,
          action: 'OPEN SETTINGS',
        };
      case 'unavailable':
        return {
          message: "We couldn't find where you are. Step into the open and try again.",
          action: 'TRY AGAIN',
        };
      case 'offline':
        return {
          message: "You're offline. Check in when you're back online; it needs to see you're here now.",
          action: null,
        };
    }
  }
  switch (problem.code) {
    case 'too_far': {
      const metres = Number(problem.detail);
      const away = Number.isFinite(metres) && metres > 0 ? `You're about ${metres} m away. ` : '';
      return {
        message: `${away}Check in when you're within ${radiusM} m of the pitch.`,
        action: 'TRY AGAIN',
      };
    }
    case 'check_in_not_open': {
      const at = problem.detail ? Date.parse(problem.detail) : NaN;
      return {
        message: Number.isFinite(at)
          ? `Check-in opens at ${clock(at, timeZone)}. Come back then.`
          : "Check-in isn't open yet.",
        action: null,
      };
    }
    case 'location_required':
      return {
        message: "Check-in needs your location, just this once. We couldn't read it.",
        action: 'TRY AGAIN',
      };
    case 'check_in_closed':
      return { message: 'Check-in has closed. The game has ended.', action: null };
    case 'check_in_unavailable':
      return {
        message: "This game has no pitch to check in against. Ask the host to confirm you're here.",
        action: null,
      };
    case 'not_attending':
      return { message: "You aren't in this game, so there's nothing to check in to.", action: null };
    case 'activity_cancelled':
      return { message: 'This game was called off.', action: null };
    case 'network':
      return {
        message: "You're offline. Check in when you're back online; it needs to see you're here now.",
        action: 'TRY AGAIN',
      };
    default:
      return { message: "That check-in didn't go through. Try again.", action: 'TRY AGAIN' };
  }
}

export type Arrival = {
  userId: string;
  name: string;
  role: 'checked' | 'in';
  /** "Host · 6:52", "You · 7:04", "6:58", "Not checked in yet". */
  meta: string;
  isMe: boolean;
  isHost: boolean;
  checkedIn: boolean;
};

/** Everyone in the game: checked in first (by arrival), then the rest. */
export function arrivals(roster: readonly RosterRow[], timeZone?: string): Arrival[] {
  const people = roster.filter((r) => r.status === 'confirmed' || r.status === 'checked_in');
  const rows = people.map((r) => {
    const checkedIn = r.status === 'checked_in';
    const who = [r.is_host ? 'Host' : null, r.is_me ? 'You' : null].filter(Boolean).join(' · ');
    const when = checkedIn && r.checked_in_at ? clock(r.checked_in_at, timeZone) : null;
    const meta = checkedIn
      ? [who || null, when].filter(Boolean).join(' · ') || 'Checked in'
      : [who || null, 'Not checked in yet'].filter(Boolean).join(' · ');
    return {
      userId: r.user_id,
      name: displayName(r),
      role: checkedIn ? 'checked' : 'in',
      meta,
      isMe: r.is_me,
      isHost: r.is_host,
      checkedIn,
      at: !checkedIn
        ? Number.POSITIVE_INFINITY
        : r.checked_in_at
          ? Date.parse(r.checked_in_at)
          : Number.MAX_SAFE_INTEGER,
    } as Arrival & { at: number };
  });
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => a.row.at - b.row.at || a.i - b.i)
    .map(({ row }) => {
      const { at: _at, ...rest } = row;
      return rest;
    });
}

/**
 * The both-checked-in moment (SCREENS.md, CheckIn: impactAsync Medium). Head-to-head Challenges
 * aren't in Slice 01, so for a game it's "you and the host are both here". Returns true only on the
 * change from not-both to both, so a revisit doesn't buzz.
 */
export function bothCheckedIn(roster: readonly RosterRow[]): boolean {
  const me = roster.find((r) => r.is_me);
  const host = roster.find((r) => r.is_host);
  if (!me || !host || me.user_id === host.user_id) return false;
  return me.status === 'checked_in' && host.status === 'checked_in';
}

export function shouldBuzzBothCheckedIn(before: boolean | null, now: boolean): boolean {
  return before === false && now;
}

/** "Jeanne-Mance Park. 6 of 8 have arrived." */
export function arrivedLine(
  placeName: string | null,
  checkedIn: number,
  confirmed: number,
): string {
  const count =
    checkedIn === 1 && confirmed === 1
      ? 'You are the only one in.'
      : `${checkedIn} of ${confirmed} ${checkedIn === 1 ? 'has' : 'have'} arrived.`;
  return placeName ? `${placeName}. ${count}` : count;
}

/** The latest a share can last (contract: the game's end + 30 minutes). */
export const SHARE_AFTER_END_MS = 30 * 60 * 1000;

/** The location sharing box, sharing or not. Times in the place's zone. */
export function shareCopy(
  share: { expires_at: string } | null,
  endsAt: string,
  timeZone?: string,
): string {
  if (share) {
    return `Your location is shared with this game only, until ${clock(share.expires_at, timeZone)}. Then it stops by itself.`;
  }
  const until = clock(Date.parse(endsAt) + SHARE_AFTER_END_MS, timeZone);
  return `Running late? Share your location with this game only, until ${until} at the latest. It stops by itself.`;
}

/** "Ade starts the game once the teams are set." */
export function nextLine(hostName: string | null, iAmHost: boolean, live: boolean): string {
  if (live) return 'The game is on.';
  if (iAmHost) return 'Start the game once the teams are set.';
  return `${hostName ? firstName(hostName) : 'The host'} starts the game once the teams are set.`;
}

/** Whether a position moved far enough to send again (metres). */
export const SHARE_MOVE_M = 50;
