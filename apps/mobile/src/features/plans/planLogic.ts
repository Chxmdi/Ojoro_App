/**
 * Pure rules for the Plan, Pull Someone In and GAME ON screens: copy built from facts the server
 * returns (docs/SLICE01_CONTRACT.md), never from sample content. No React Native imports.
 */
import { effectivePlanStatus, type PlanStatus } from '@ojoro/contracts';

import { clock, closesLabel, DEFAULT_TIME_ZONE } from './time';

/* ---------- Status ---------- */

export type PlanStatusFacts = {
  status: PlanStatus;
  effective_status: PlanStatus | null;
  deadline_at: string;
};

/**
 * The status to show. The server's `effective_status` is right when it was read; the deadline can
 * pass while the screen is open or offline, so the time rule is applied on top (contract rule 2).
 */
export function displayStatus(plan: PlanStatusFacts, now: Date): PlanStatus {
  const stored = plan.effective_status ?? plan.status;
  return effectivePlanStatus({ status: stored, deadline_at: plan.deadline_at }, now);
}

/** The PlanForming variant to draw. */
export type FormingVariant = 'early' | 'viable' | 'almost' | 'need-one-more' | 'game-on' | 'expired';

/**
 * The variant from the status and count. At one spot left PlanForming itself shows I'M DOWN to
 * people not in and YOU'RE DOWN + PULL SOMEONE IN to people in.
 */
export function formingVariant(count: number, capacity: number, status: PlanStatus): FormingVariant {
  if (status === 'expired' || status === 'cancelled') return 'expired';
  if (status === 'game_on' || count >= capacity) return 'game-on';
  if (capacity - count === 1) return 'need-one-more';
  if (count / capacity >= 0.75) return 'almost';
  if (count / capacity >= 0.5) return 'viable';
  return 'early';
}

/** The line under the plan: what I'M DOWN means before GAME ON. */
export function lockNote(joined: boolean, capacity: number): string {
  return joined
    ? `You're down, but it's not on yet. The plan locks at ${capacity} and everyone gets GAME ON at the same moment.`
    : `Nobody's committed to a game until it fills. The plan locks at ${capacity} and everyone in gets GAME ON at the same moment.`;
}

/* ---------- Who's in ---------- */

export type RosterRow = {
  user_id: string;
  display_name: string;
  avatar_path: string | null;
  joined_at: string;
  is_host: boolean;
  is_me: boolean;
  games_with_me: number | null;
  is_first_game: boolean;
  hosted_count: number;
  position: string | null;
  invited_by_me: boolean;
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The context line under a name, from the facts (contract: plan_roster). */
export function rosterMeta(row: RosterRow): string {
  const parts: string[] = [];
  if (row.is_host) {
    parts.push('Started the plan');
    if (row.hosted_count > 0) parts.push(plural(row.hosted_count, 'game hosted', 'games hosted'));
    return parts.join(' · ');
  }
  if (row.is_me) {
    parts.push('You');
    if (row.position) parts.push(row.position.toLowerCase());
    return parts.join(' · ');
  }
  if (row.invited_by_me) parts.push('joined from your invite');
  if (row.games_with_me && row.games_with_me > 0) {
    parts.push(plural(row.games_with_me, 'game with you', 'games with you'));
  } else if (row.is_first_game) {
    parts.push('First game');
  }
  return parts.join(' · ');
}

/** Rows shown before the "+ Sam K and Yara M" line. */
export const ROSTER_SHOWN = 4;

/** "+ Sam K and Yara M", "+ Sam K, Yara M and Joel P", "+ Sam K, Yara M and 3 more". */
export function moreLine(names: readonly string[], hidden = 0): string | null {
  const total = names.length + hidden;
  if (total === 0) return null;
  if (names.length === 0) return `+ ${total} more`;
  const listed = names.length + hidden > 3 ? names.slice(0, 2) : names;
  const rest = total - listed.length;
  if (rest > 0) return `+ ${listed.join(', ')} and ${rest} more`;
  if (listed.length === 1) return `+ ${listed[0]}`;
  return `+ ${listed.slice(0, -1).join(', ')} and ${listed[listed.length - 1]}`;
}

/** First name for copy ("Joel P" → "Joel"). */
export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? displayName;
}

/* ---------- Leaving ---------- */

export type LeaveConfirm = { title: string; body: string };

/**
 * I CAN'T MAKE IT asks first only when leaving costs the group: you host it, or it's at least
 * half full. Otherwise it leaves at once (with UNDO).
 */
export function leaveConfirm(input: {
  count: number;
  capacity: number;
  isHost: boolean;
  nextHost: string | null;
}): LeaveConfirm | null {
  const { count, capacity, isHost, nextHost } = input;
  const costly = isHost || count / capacity >= 0.5;
  if (!costly) return null;
  const after = Math.max(0, count - 1);
  let body = `${count} of ${capacity} are in. Leaving drops it to ${after} of ${capacity}.`;
  if (isHost) {
    body +=
      after === 0
        ? ' You are the last one in, so the plan is called off.'
        : nextHost
          ? ` ${nextHost} hosts it after you.`
          : ' The next person in hosts it after you.';
  }
  return { title: 'LEAVE THIS PLAN?', body };
}

/** Who hosts after the host leaves: the longest-standing other member. */
export function nextHost(roster: readonly RosterRow[]): string | null {
  const others = roster
    .filter((r) => !r.is_host)
    .sort((a, b) => Date.parse(a.joined_at) - Date.parse(b.joined_at));
  return others[0]?.display_name ?? null;
}

/* ---------- Time poll ---------- */

export type TimeOption = { id: string; starts_at: string; vote_count: number };

export function pollModel(
  options: readonly TimeOption[],
  myOptionId: string | null,
  timeZone: string = DEFAULT_TIME_ZONE,
): { options: { label: string; votes: number }[]; voted: number | undefined; ids: string[] } {
  const sorted = [...options].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const index = sorted.findIndex((o) => o.id === myOptionId);
  return {
    options: sorted.map((o) => ({ label: clock(o.starts_at, timeZone), votes: o.vote_count })),
    voted: index >= 0 ? index : undefined,
    ids: sorted.map((o) => o.id),
  };
}

/** The poll closes at `poll_closes_at`, or the deadline, and only takes votes while forming. */
export function pollClosed(
  plan: { poll_closes_at: string | null; deadline_at: string },
  status: PlanStatus,
  now: Date,
): boolean {
  if (status !== 'forming') return true;
  return Date.parse(plan.poll_closes_at ?? plan.deadline_at) <= now.getTime();
}

export function pollCloses(
  plan: { poll_closes_at: string | null; deadline_at: string },
  now: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  return closesLabel(plan.poll_closes_at ?? plan.deadline_at, now, timeZone);
}

/** Up to 4 options. */
export const MAX_TIME_OPTIONS = 4;

/**
 * Times a member can suggest: every 30 minutes from 90 minutes before to 2 hours after the plan's
 * start, still to come (at least 15 minutes ahead, as `create_plan` requires), not already offered.
 */
export function suggestableTimes(
  startsAt: string,
  existing: readonly string[],
  now: Date,
): string[] {
  const start = Date.parse(startsAt);
  const taken = new Set(existing.map((t) => Date.parse(t)));
  const out: string[] = [];
  for (let step = -3; step <= 4; step++) {
    const t = start + step * 30 * 60 * 1000;
    if (step === 0 || taken.has(t)) continue;
    if (t < now.getTime() + 15 * 60 * 1000) continue;
    out.push(new Date(t).toISOString());
  }
  return out;
}

/* ---------- Place ---------- */

/** Great-circle distance in km, one decimal. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * 10) / 10;
}

/** "1.2 km". */
export function distanceLabel(km: number | null | undefined): string | undefined {
  if (km === null || km === undefined) return undefined;
  return `${km} km`;
}

/** The privacy line under WHERE. Members also see the meeting point above it. */
export function wherePrivacyLine(hostName: string | null): string {
  const lead = hostName ? `Proposed by ${firstName(hostName)}. ` : '';
  return `${lead}The exact pitch is shared with people in the plan only.`;
}

/* ---------- Expired, full, waitlist ---------- */

export function expiredSummary(count: number, capacity: number): string {
  return `${count} of ${capacity} by the deadline. Nobody was charged or marked as a no-show.`;
}

export function cancelledSummary(): string {
  return 'The host called it off. Nobody was charged or marked as a no-show.';
}

/** "2 people ahead of you. If a spot opens before 7:00 you're in automatically." */
export function waitlistNote(
  waitlistCount: number,
  checkInOpensAt: string | null,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  const ahead =
    waitlistCount === 0 ? 'Nobody ahead of you.' : `${plural(waitlistCount, 'person', 'people')} ahead of you.`;
  const promote = checkInOpensAt
    ? ` If a spot opens before ${clock(checkInOpensAt, timeZone)} you're in automatically.`
    : " If a spot opens you're in automatically.";
  return ahead + promote;
}

/** What happened after JOIN WAITLIST (`attendance_state`). */
export function waitlistResult(state: {
  status: string | null;
  waitlist_position: number | null;
}): string {
  if (state.status === 'confirmed') return "A spot was free. You're in.";
  const ahead = Math.max(0, (state.waitlist_position ?? 1) - 1);
  return ahead === 0
    ? "You're first on the waitlist."
    : `You're on the waitlist. ${plural(ahead, 'person', 'people')} ahead of you.`;
}

/* ---------- GAME ON ---------- */

/** How long after the last join the takeover still says JUST NOW. */
export const JUST_NOW_MS = 5 * 60 * 1000;

/** "JUST NOW · JOEL MADE IT 8", or null when the last join isn't recent. */
export function gameOnOverline(
  roster: readonly Pick<RosterRow, 'display_name' | 'joined_at' | 'is_me'>[],
  count: number,
  now: Date,
): string | null {
  const last = [...roster].sort((a, b) => Date.parse(b.joined_at) - Date.parse(a.joined_at))[0];
  if (!last || now.getTime() - Date.parse(last.joined_at) > JUST_NOW_MS) return null;
  const who = last.is_me ? 'YOU' : firstName(last.display_name).toUpperCase();
  return `JUST NOW · ${who} MADE IT ${count}`;
}

/** "All 8 got this at the same moment. Check-in opens at 7:00." */
export function gameOnNote(
  count: number,
  checkInOpensAt: string | null,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  const lead = `All ${count} got this at the same moment.`;
  return checkInOpensAt ? `${lead} Check-in opens at ${clock(checkInOpensAt, timeZone)}.` : lead;
}

/**
 * Whether to take the person over to GAME ON: they're in, and this screen saw the plan go from
 * forming to game on (realtime or their own I'M DOWN). Opening a plan that's already GAME ON
 * doesn't take over.
 */
export function shouldTakeOver(
  previous: PlanStatus | undefined,
  next: PlanStatus,
  joined: boolean,
): boolean {
  return joined && previous === 'forming' && next === 'game_on';
}

/* ---------- Pull someone in ---------- */

export type Candidate = {
  user_id: string;
  display_name: string;
  games_with_me: number | null;
  pull_me_in: boolean;
  free_at_plan_time: boolean;
  plays_sport: boolean;
  already_invited: boolean;
};

/** The reason line: "6 games with you · Pull Me In is on for football · free tonight". */
export function candidateReason(c: Candidate, sportName: string, day: string): string {
  const parts: string[] = [];
  if (c.games_with_me && c.games_with_me > 0) parts.push(plural(c.games_with_me, 'game with you', 'games with you'));
  if (c.pull_me_in) parts.push(`Pull Me In is on for ${sportName.toLowerCase()}`);
  else if (c.plays_sport) parts.push(`plays ${sportName.toLowerCase()}`);
  if (c.free_at_plan_time) parts.push(`free ${day.toLowerCase()}`);
  if (c.already_invited) parts.push('invited');
  return parts.join(' · ');
}

export function quotaLine(remaining: number, quota: number): string {
  if (remaining <= 0) return `You've sent your ${quota} invites for this plan.`;
  return `Ranked by who's most likely to say yes. You can send ${remaining} more ${remaining === 1 ? 'invite' : 'invites'} for this plan.`;
}

export function sendLabel(picked: number): string {
  if (picked === 0) return 'PICK SOMEONE';
  return `SEND ${picked} ${picked === 1 ? 'INVITE' : 'INVITES'}`;
}

/** The privacy promise under the send button. */
export function inviteCaption(pickedNames: readonly string[]): string {
  const tail = "sees who's in, the time and the place. Nothing else.";
  if (pickedNames.length === 1) return `${firstName(pickedNames[0] ?? '')} ${tail}`;
  if (pickedNames.length > 1) return `They see who's in, the time and the place. Nothing else.`;
  return `Anyone you pull in ${tail}`;
}

/** Toggle a pick, keeping within what's left of the quota. */
export function togglePick(picked: readonly string[], id: string, remaining: number): string[] {
  if (picked.includes(id)) return picked.filter((p) => p !== id);
  if (picked.length >= remaining) return [...picked];
  return [...picked, id];
}

export function sentMessage(sent: number, names: readonly string[]): string {
  if (sent === 0) return 'They were already invited. Nothing new was sent.';
  if (sent === 1 && names.length === 1) return `Invite sent. ${inviteCaption(names)}`;
  return `${sent} invites sent. They see who's in, the time and the place.`;
}

/* ---------- Calendar and directions ---------- */

function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

/** An iCalendar event for ADD TO CALENDAR (a device hand-off; nothing is synced). */
export function icsEvent(e: {
  uid: string;
  title: string;
  startsAt: string;
  durationMinutes: number;
  location: string | null;
  now: Date;
}): string {
  const end = new Date(Date.parse(e.startsAt) + e.durationMinutes * 60 * 1000).toISOString();
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ojoro//Plan//EN',
    'BEGIN:VEVENT',
    `UID:${e.uid}@ojoro`,
    `DTSTAMP:${icsDate(e.now.toISOString())}`,
    `DTSTART:${icsDate(e.startsAt)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(e.title)}`,
    ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/**
 * DIRECTIONS hands off to the device's maps app (no maps provider is chosen). iOS opens Apple Maps,
 * Android the `geo:` handler, the web a maps search. Null without coordinates.
 */
export function directionsUrl(
  os: string,
  to: { lat: number | null; lng: number | null; label: string | null },
): string | null {
  if (to.lat === null || to.lng === null) return null;
  const label = encodeURIComponent(to.label ?? 'Meeting point');
  if (os === 'ios') return `http://maps.apple.com/?daddr=${to.lat},${to.lng}&q=${label}`;
  if (os === 'android') return `geo:${to.lat},${to.lng}?q=${to.lat},${to.lng}(${label})`;
  return `https://maps.apple.com/?daddr=${to.lat},${to.lng}&q=${label}`;
}
