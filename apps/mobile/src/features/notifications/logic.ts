/**
 * Updates (Notifications.png) and Settings → Notifications: pure rules, no React Native. Words come
 * from the server (`my_notifications().title/body`); this file picks the icon, the tone, the inline
 * action, the time label, the quiet-hours caption and the settings labels.
 * Contract: docs/MESSAGING_CONTRACT.md (Notifications, Screens).
 */
import type { NotificationAction, NotificationType } from '@ojoro/contracts';

import { clock, dayDiff, DEFAULT_TIME_ZONE, zonedParts } from '../plans/time';

/** The design-system disc: a line icon, a brand graphic or the actor's avatar. */
export type Leading =
  | { kind: 'icon'; icon: 'people' | 'chat' | 'check' | 'clock' | 'bell' | 'alert' | 'compete' | 'lights' }
  | { kind: 'graphic'; graphic: 'o' | 'mark' }
  | { kind: 'person'; name: string };

/** The fields of a `my_notifications()` row these rules read. */
export type NotificationFacts = {
  id: string;
  type: NotificationType;
  section: string;
  needs_you: boolean;
  action: string;
  href: string;
  plan_id: string | null;
  activity_id: string | null;
  actor_names: string[] | null;
  updated_at: string;
  read_at: string | null;
};

/** The disc for a type. People events with a named actor show that person (Lena joined …). */
export function leadingFor(row: Pick<NotificationFacts, 'type' | 'actor_names'>): Leading {
  switch (row.type) {
    case 'crew_member_joined': {
      const name = row.actor_names?.[0];
      return name ? { kind: 'person', name } : { kind: 'icon', icon: 'people' };
    }
    case 'need_one_more':
    case 'participant_update':
    case 'pull_in_invite':
    case 'run_it_back_invite':
      return { kind: 'icon', icon: 'people' };
    case 'crew_poll':
    case 'crew_plan':
    case 'mention':
      return { kind: 'icon', icon: 'chat' };
    case 'game_on':
    case 'waitlist_promoted':
      return { kind: 'icon', icon: 'check' };
    case 'check_in_open':
      return { kind: 'icon', icon: 'clock' };
    case 'activity_changed':
      return { kind: 'icon', icon: 'alert' };
    case 'live':
      return { kind: 'icon', icon: 'lights' };
    case 'result_to_confirm':
      return { kind: 'icon', icon: 'compete' };
    case 'recap_ready':
      return { kind: 'graphic', graphic: 'o' };
    case 'challenge_response':
      return { kind: 'graphic', graphic: 'mark' };
    default:
      return { kind: 'icon', icon: 'bell' };
  }
}

/** The disc's ground: GAME ON is the filled signal disc, Needs you a strong ring, the rest quiet. */
export function toneFor(row: Pick<NotificationFacts, 'type' | 'needs_you'>): 'quiet' | 'strong' | 'signal' {
  if (row.type === 'game_on') return 'signal';
  return row.needs_you ? 'strong' : 'quiet';
}

/**
 * The one inline action, only while the row needs you (Today and Earlier rows are links only, as
 * in the design). `rpc`: the action runs here (I'M DOWN, CONFIRM). `go`: it opens the screen that
 * does it (VOTE → the poll, CHECK IN → the check-in screen, REPLY → the chat, PULL SOMEONE IN).
 */
export type InlineAction =
  | { kind: 'rpc'; action: 'im_down' | 'confirm_result'; label: string; primary: boolean }
  | { kind: 'go'; action: 'vote' | 'check_in' | 'reply' | 'pull_in'; label: string; href: string; actsOnOpen: boolean };

export function inlineAction(row: NotificationFacts): InlineAction | null {
  if (!row.needs_you) return null;
  const action = row.action as NotificationAction;
  switch (action) {
    case 'im_down':
      return row.plan_id ? { kind: 'rpc', action, label: "I'M DOWN", primary: true } : null;
    case 'confirm_result':
      return row.activity_id ? { kind: 'rpc', action, label: 'CONFIRM', primary: false } : null;
    case 'vote':
      // Voting happens in the poll; the row leaves Needs you by itself once you've voted.
      return { kind: 'go', action, label: 'VOTE', href: row.href, actsOnOpen: false };
    case 'check_in':
      // Check-in needs your location, so it happens on the check-in screen.
      return {
        kind: 'go',
        action,
        label: 'CHECK IN',
        href: row.activity_id ? `/activity/${row.activity_id}/check-in` : row.href,
        actsOnOpen: false,
      };
    case 'reply':
      // Opening the chat is the reply.
      return { kind: 'go', action, label: 'REPLY', href: row.href, actsOnOpen: true };
    case 'pull_in':
      return {
        kind: 'go',
        action,
        label: 'PULL SOMEONE IN',
        href: row.plan_id ? `/plan/${row.plan_id}/pull-in` : row.href,
        actsOnOpen: false,
      };
    default:
      return null;
  }
}

/**
 * The time under a row, as written in the design: "4 min ago", "2 h ago" (under 3 hours), "2:20 PM"
 * (earlier today), "Yesterday", "Sun" (this week), "Oct 6".
 */
export function notificationTime(updatedAt: string, now: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  const ms = now.getTime() - Date.parse(updatedAt);
  if (ms < 60_000) return 'Just now';
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)} min ago`;
  if (ms < 3 * 3600_000) return `${Math.floor(ms / 3600_000)} h ago`;
  const days = -dayDiff(updatedAt, now, timeZone);
  if (days <= 0) return `${clock(updatedAt, timeZone)} ${zonedParts(updatedAt, timeZone).hour < 12 ? 'AM' : 'PM'}`;
  if (days === 1) return 'Yesterday';
  const d = new Date(updatedAt);
  if (days < 7) return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(d);
  return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' }).format(d);
}

/** The newest `updated_at` among rows (what mark_notifications_read(p_before) takes), or null. */
export function newestUpdatedAt(rows: readonly Pick<NotificationFacts, 'updated_at'>[]): string | null {
  let best: string | null = null;
  for (const r of rows) if (best === null || Date.parse(r.updated_at) > Date.parse(best)) best = r.updated_at;
  return best;
}

/** Any row still unread (so opening Updates has something to mark). */
export function hasUnread(rows: readonly Pick<NotificationFacts, 'read_at'>[]): boolean {
  return rows.some((r) => r.read_at === null);
}

/**
 * NEW stays on a row for as long as Updates is open, even after it has been marked read: the ids
 * seen unread so far, plus any unread now.
 */
export function seenUnread(
  previous: ReadonlySet<string>,
  rows: readonly Pick<NotificationFacts, 'id' | 'read_at'>[],
): Set<string> {
  const next = new Set(previous);
  for (const r of rows) if (r.read_at === null) next.add(r.id);
  return next;
}

/* ---------- Quiet hours ---------- */

export type PrefsFacts = {
  quiet_hours_enabled: boolean | null;
  quiet_start: string | null;
  quiet_end: string | null;
  show_details: boolean | null;
};

/** "23:00:00" → "11 PM"; "06:30" → "6:30 AM"; "00:00" → "midnight". */
export function quietTime(value: string | null | undefined): string {
  const [hh = '0', mm = '0'] = (value ?? '00:00').split(':');
  const h = Number(hh);
  const m = Number(mm);
  if (h === 0 && m === 0) return 'midnight';
  if (h === 12 && m === 0) return 'noon';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
}

/** The caption under YOU'RE CAUGHT UP. ("Quiet hours 11 PM to 7 AM. Lock-screen previews never show who or where."). */
export function quietCaption(prefs: PrefsFacts | null | undefined): string {
  const p = prefs ?? { quiet_hours_enabled: true, quiet_start: '23:00', quiet_end: '07:00', show_details: false };
  const quiet =
    p.quiet_hours_enabled === false
      ? 'Quiet hours are off.'
      : `Quiet hours ${quietTime(p.quiet_start ?? '23:00')} to ${quietTime(p.quiet_end ?? '07:00')}.`;
  const lock = p.show_details
    ? 'Lock-screen previews show what the update is about.'
    : 'Lock-screen previews never show who or where.';
  return `${quiet} ${lock}`;
}

/** Quiet-hour choices for the settings chips (evenings to start, mornings to end), keeping the current one. */
export const QUIET_STARTS = ['21:00', '22:00', '23:00', '00:00'] as const;
export const QUIET_ENDS = ['06:00', '07:00', '08:00', '09:00'] as const;

/** "23:00:00" → "23:00". */
export function hhmm(value: string | null | undefined): string {
  return (value ?? '').slice(0, 5);
}

/** The options to show: the fixed ones, plus the saved value when it isn't one of them. */
export function quietOptions(fixed: readonly string[], current: string | null | undefined): string[] {
  const c = hhmm(current);
  return c && !fixed.includes(c) ? [...fixed, c].sort() : [...fixed];
}

/* ---------- Push per type ---------- */

/** Settings rows: each type a person can switch, with a sentence-case label and what it is. */
export const TYPE_SETTINGS: readonly { type: NotificationType; label: string; description: string }[] = [
  { type: 'need_one_more', label: 'Need one more', description: 'A plan you can join is one person short.' },
  { type: 'game_on', label: 'GAME ON', description: 'A plan you are in is on.' },
  { type: 'pull_in_invite', label: 'Pulled in', description: 'Someone pulls you into a plan.' },
  { type: 'run_it_back_invite', label: 'Run it back', description: 'Someone asks you to play again.' },
  { type: 'crew_poll', label: 'Crew polls', description: 'Your crew is picking a time.' },
  { type: 'crew_plan', label: 'Crew plans', description: 'Your crew made a plan.' },
  { type: 'mention', label: 'Mentions', description: 'Someone mentions you in a chat.' },
  { type: 'check_in_open', label: 'Check-in', description: 'Check-in for your game is about to open.' },
  { type: 'live', label: 'Live', description: 'A game you follow goes live.' },
  { type: 'result_to_confirm', label: 'Scores to confirm', description: 'A score from your game needs you.' },
  { type: 'recap_ready', label: 'Recaps', description: 'The recap of your game is ready.' },
  { type: 'activity_changed', label: 'Changes', description: 'A time, place or cancellation.' },
  { type: 'participant_update', label: 'Who joined or left', description: 'For plans you host.' },
  { type: 'waitlist_promoted', label: 'Off the waitlist', description: 'A spot opened for you.' },
  { type: 'crew_member_joined', label: 'New crew members', description: 'Someone joins your crew.' },
];

/** Whether a type's push is on, from `push_off`. */
export function pushOn(pushOff: readonly string[] | null | undefined, type: NotificationType): boolean {
  return !(pushOff ?? []).includes(type);
}

/* ---------- Mutes ---------- */

/** The object kind as a word for the muted list ("Plan", "Game", "Crew"). */
export function muteKindLabel(kind: string): string {
  return kind === 'plan' ? 'Plan' : kind === 'activity' ? 'Game' : kind === 'crew' ? 'Crew' : 'Challenge';
}

/** "Muted until you unmute it" / "Muted until Sat 10:00". */
export function muteUntilLabel(until: string | null, timeZone: string = DEFAULT_TIME_ZONE): string {
  if (!until) return 'Muted until you unmute it';
  const d = new Date(until);
  const day = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(d);
  return `Muted until ${day} ${clock(until, timeZone)}`;
}

/** The bell's accessible name, with the count ("Updates, 3 new"); the badge itself is hidden. */
export function bellLabel(count: number): string {
  return count > 0 ? `Updates, ${count} new` : 'Updates';
}

/**
 * Needs you, held for the visit. The server counts a row as needing you only while it's unread
 * (contract: "Needs you = unread, not acted on, and the action still valid"), and Updates marks
 * everything read on open, so on the refetch every row would drop to Today. Rows seen needing you
 * during this visit stay there, with their action, until they're acted on.
 */
export function stickyNeedsYou(
  previous: ReadonlySet<string>,
  rows: readonly Pick<NotificationFacts, 'id' | 'needs_you'>[],
): Set<string> {
  const next = new Set(previous);
  for (const r of rows) if (r.needs_you) next.add(r.id);
  return next;
}

/** The rows as Updates shows them: held rows back in Needs you (acted ones leave). */
export function withHeldNeedsYou<T extends NotificationFacts & { acted_at: string | null }>(
  rows: readonly T[],
  held: ReadonlySet<string>,
): T[] {
  const out = rows.map((r) =>
    !r.needs_you && held.has(r.id) && r.acted_at === null ? { ...r, needs_you: true, section: 'needs_you' } : r,
  );
  // Keep the server's order within a section; needs you first.
  const rank = (s: string) => (s === 'needs_you' ? 0 : s === 'today' ? 1 : 2);
  return out
    .map((r, i) => ({ r, i }))
    .sort((a, b) => rank(a.r.section) - rank(b.r.section) || a.i - b.i)
    .map((x) => x.r);
}
