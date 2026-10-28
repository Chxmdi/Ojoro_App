/**
 * What the Activity screen shows, from the rows the contract gives (activity_cards, activity_roster).
 * Pure, so the rules are tested in Node; the screen only draws the result.
 */
import { checkInWindowState, type ActivityStatus } from '@ojoro/contracts';

import {
  attendanceRuleLabel,
  clock,
  costLabel,
  firstName,
  hourWithPeriod,
  namesList,
  shortDate,
} from './format';

/** The `activity_cards` columns these screens read (nullable where the view can return null). */
export type ActivityCard = {
  id: string;
  plan_id: string;
  sport_id: string;
  sport_name: string;
  title: string | null;
  starts_at: string;
  ends_at: string;
  capacity: number;
  confirmed_count: number;
  waitlist_count: number;
  checked_in_count: number;
  host_id: string;
  place_id: string | null;
  place_name: string | null;
  place_area: string | null;
  level_label: string | null;
  team_a_label: string | null;
  team_b_label: string | null;
  teams_note: string | null;
  kit_note: string | null;
  cost_cents: number;
  currency: string;
  attendance_rule: string;
  check_in_opens_at: string;
  check_in_closes_at: string;
  check_in_radius_m: number;
  status: ActivityStatus;
  effective_status: ActivityStatus | null;
  live_at: string | null;
  ended_at: string | null;
  after_closes_at: string;
  cancelled_at: string | null;
  my_attendance: 'confirmed' | 'waitlisted' | 'cancelled' | 'checked_in' | null;
};

/** One `activity_roster` row; the generated types mark every column non-null, the contract doesn't. */
export type RosterRow = {
  user_id: string;
  display_name: string | null;
  avatar_path: string | null;
  status: 'confirmed' | 'waitlisted' | 'cancelled' | 'checked_in';
  team: 'a' | 'b' | null;
  is_host: boolean;
  is_me: boolean;
  checked_in_at: string | null;
  waitlisted_at: string | null;
  games_with_me: number | null;
  invited_by_me: boolean | null;
  position: string | null;
};

export type MyAttendance = 'player' | 'checked-in' | 'waitlisted' | 'out';

export function myAttendance(card: Pick<ActivityCard, 'my_attendance'>): MyAttendance {
  switch (card.my_attendance) {
    case 'checked_in':
      return 'checked-in';
    case 'confirmed':
      return 'player';
    case 'waitlisted':
      return 'waitlisted';
    default:
      return 'out';
  }
}

/** The view's status, or the same rule computed locally (offline, between job ticks). */
export function statusOf(card: ActivityCard, now: Date): ActivityStatus {
  // The view's value is right when it was read; time moves on, so recompute from the timestamps.
  if (card.status === 'cancelled' || card.effective_status === 'cancelled') return 'cancelled';
  const t = now.getTime();
  if (card.status === 'complete' || Date.parse(card.after_closes_at) <= t) return 'complete';
  if (Date.parse(card.ended_at ?? card.ends_at) <= t) return 'after';
  if (Date.parse(card.live_at ?? card.starts_at) <= t) return 'live';
  return card.effective_status === 'live' || card.effective_status === 'after'
    ? card.effective_status
    : 'confirmed';
}

/** "Pickup football", or the sport name when the plan has no title. */
export function activityName(card: Pick<ActivityCard, 'title' | 'sport_name'>): string {
  return card.title?.trim() || card.sport_name;
}

export type DetailItem = { label: string; value: string };

/** TEAMS, KIT, COST, ATTENDANCE, then MEET AT (players only; privacy). */
export function detailItems(card: ActivityCard, meetingPoint: string | null): DetailItem[] {
  const items: DetailItem[] = [];
  const teams =
    card.teams_note ??
    (card.team_a_label && card.team_b_label ? `${card.team_a_label} vs ${card.team_b_label}.` : null);
  if (teams) items.push({ label: 'TEAMS', value: teams });
  if (card.kit_note) items.push({ label: 'KIT', value: card.kit_note });
  items.push({ label: 'COST', value: costLabel(card.cost_cents, card.currency) });
  items.push({ label: 'ATTENDANCE', value: attendanceRuleLabel(card.attendance_rule) });
  if (meetingPoint) items.push({ label: 'MEET AT', value: meetingPoint });
  return items;
}

/** Shown to people who aren't in the game instead of the meeting point. */
export const MEETING_POINT_PRIVATE = 'The exact pitch is shared with people in the game only.';

export type ParticipantView = {
  userId: string;
  name: string;
  role: 'host' | 'in' | 'checked';
  meta: string;
  isMe: boolean;
  isHost: boolean;
  checkedIn: boolean;
  checkedInAt: string | null;
};

function teamLabel(card: Pick<ActivityCard, 'team_a_label' | 'team_b_label'>, team: 'a' | 'b' | null) {
  if (team === 'a') return card.team_a_label ?? 'Team A';
  if (team === 'b') return card.team_b_label ?? 'Team B';
  return null;
}

export function displayName(row: Pick<RosterRow, 'display_name'>): string {
  return row.display_name?.trim() || 'Someone';
}

/** Who's playing: confirmed and checked-in people, host first, then you, then by arrival. */
export function playingRows(card: ActivityCard, roster: readonly RosterRow[]): ParticipantView[] {
  return roster
    .filter((r) => r.status === 'confirmed' || r.status === 'checked_in')
    .map((r) => {
      const parts: string[] = [];
      if (r.is_host) parts.push('Host');
      if (r.is_me) parts.push('You');
      const team = teamLabel(card, r.team);
      if (team) parts.push(team);
      if (!r.is_me && r.invited_by_me) parts.push('joined from your invite');
      else if (!r.is_me && !r.is_host && r.games_with_me) {
        parts.push(`${r.games_with_me} ${r.games_with_me === 1 ? 'game' : 'games'} with you`);
      }
      const checkedIn = r.status === 'checked_in';
      return {
        userId: r.user_id,
        name: displayName(r),
        role: r.is_host ? 'host' : checkedIn ? 'checked' : 'in',
        meta: parts.join(' · '),
        isMe: r.is_me,
        isHost: r.is_host,
        checkedIn,
        checkedInAt: r.checked_in_at,
      } satisfies ParticipantView;
    });
}

/** Rows drawn before the "+ names" line (Activity.png shows four). */
export const ROSTER_PREVIEW = 4;

/** "+ Lena, Sam, Yara and Tolu · 2 on the waitlist", or null when there's nothing more to say. */
export function overflowLine(rest: readonly ParticipantView[], waitlistCount: number): string | null {
  const parts: string[] = [];
  if (rest.length > 0) parts.push(`+ ${namesList(rest.map((r) => firstName(r.name)))}`);
  if (waitlistCount > 0) parts.push(`${waitlistCount} on the waitlist`);
  return parts.length ? parts.join(' · ') : null;
}

/** "WHO'S PLAYING · 8 OF 8". */
export function whoTitle(card: Pick<ActivityCard, 'confirmed_count' | 'capacity'>): string {
  return `WHO'S PLAYING · ${card.confirmed_count} OF ${card.capacity}`;
}

export type CheckInCta =
  | { kind: 'none' }
  | { kind: 'early'; hint: string }
  | { kind: 'open'; hint: string }
  | { kind: 'done'; hint: string };

/** The CHECK IN button and the line under it. */
export function checkInCta(card: ActivityCard, now: Date, timeZone?: string): CheckInCta {
  const me = myAttendance(card);
  const status = statusOf(card, now);
  if (status !== 'confirmed' && status !== 'live') return { kind: 'none' };
  if (me === 'checked-in') return { kind: 'done', hint: "You're checked in." };
  if (me !== 'player') return { kind: 'none' };
  const radius = `${card.check_in_radius_m} m`;
  switch (checkInWindowState(card, now)) {
    case 'early':
      return {
        kind: 'early',
        hint: `Opens at ${clock(card.check_in_opens_at, timeZone)} when you're within ${radius} of the pitch.`,
      };
    case 'open':
      return { kind: 'open', hint: `Open now. Check in when you're within ${radius} of the pitch.` };
    default:
      return { kind: 'none' };
  }
}

/** I CAN'T MAKE IT ANYMORE is offered until the start, to people in and not yet checked in. */
export function canCancel(card: ActivityCard, now: Date): boolean {
  return myAttendance(card) === 'player' && statusOf(card, now) === 'confirmed';
}

/** Waitlist promotion happens only until check-in opens (DESIGN_DECISIONS). */
function promotesWaitlist(card: ActivityCard, now: Date): boolean {
  return card.waitlist_count > 0 && now.getTime() < Date.parse(card.check_in_opens_at);
}

/** The confirm modal's consequence, in counts. */
export function cancelBody(card: ActivityCard, now: Date): string {
  const freed = promotesWaitlist(card, now)
    ? 'Your spot goes to the first person on the waitlist.'
    : 'Your spot opens for someone else.';
  return `${card.confirmed_count} of ${card.capacity} are in. ${freed} To get back in, you'd join the waitlist.`;
}

export type JoinOffer = { label: string; body: string } | null;

/** For people who aren't in (or dropped out): join the waitlist, or take a free spot. */
export function joinOffer(card: ActivityCard, now: Date, timeZone?: string): JoinOffer {
  const me = myAttendance(card);
  if (me !== 'out' || statusOf(card, now) !== 'confirmed') return null;
  const left = card.capacity - card.confirmed_count;
  const opens = clock(card.check_in_opens_at, timeZone);
  if (left > 0 && now.getTime() < Date.parse(card.check_in_opens_at)) {
    return {
      label: 'TAKE THE SPOT',
      body: `${left} ${left === 1 ? 'spot is' : 'spots are'} open. Tap and you're in.`,
    };
  }
  const ahead = card.waitlist_count;
  return {
    label: 'JOIN WAITLIST',
    body:
      `${ahead === 0 ? 'Nobody' : ahead === 1 ? '1 person' : `${ahead} people`} on the waitlist. ` +
      (now.getTime() < Date.parse(card.check_in_opens_at)
        ? `If a spot opens before ${opens} you're in automatically.`
        : 'Check-in has opened, so spots no longer move to the waitlist.'),
  };
}

/** You're waitlisted: where you are, when you know it. */
export function waitlistLine(
  card: ActivityCard,
  position: number | null,
  now: Date,
  timeZone?: string,
): string {
  const opens = clock(card.check_in_opens_at, timeZone);
  const before = now.getTime() < Date.parse(card.check_in_opens_at);
  const auto = before
    ? `If a spot opens before ${opens} you're in automatically.`
    : 'Check-in has opened, so spots no longer move to the waitlist.';
  if (position === null) {
    return `You're on the waitlist. ${card.waitlist_count} on it. ${auto}`;
  }
  const ahead = position - 1;
  const lead =
    ahead <= 0 ? "You're next." : `${ahead} ${ahead === 1 ? 'person' : 'people'} ahead of you.`;
  return `${lead} ${auto}`;
}

/** The finished game's header line on the Activity screen. */
export function finishedLine(card: ActivityCard, status: ActivityStatus, timeZone?: string): string {
  if (status === 'cancelled') return 'The host called this game off. Nobody was charged.';
  if (status === 'after') {
    return `The game has ended. Confirm the score and add photos until ${shortDate(card.after_closes_at, timeZone).split(' ')[0]} ${hourWithPeriod(card.after_closes_at, timeZone)}.`;
  }
  return 'The game is over. The recap stays on your Passport.';
}
