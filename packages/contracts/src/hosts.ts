/**
 * Step 6 (Host and Organizer OS core, PRD §13) client contract helpers: programs, series and their
 * sessions, the roster and waitlist, join requests, the People CRM and announcements. The full
 * contract is docs/HOSTS_CONTRACT.md; the database shapes are generated into ./database.types.ts.
 * Money (passes, payments, refunds, payouts, leagues) is in hostsOps.ts / docs/HOSTS_OPS_CONTRACT.md.
 *
 * Pure TypeScript with no runtime dependencies.
 */
import type { Database } from './database.types';
import type { RealtimeSubscription } from './slice01';
import type { WithNull } from './competition';

type Functions = Database['public']['Functions'];
type Enums = Database['public']['Enums'];
type Tables = Database['public']['Tables'];
type CompositeTypes = Database['public']['CompositeTypes'];
type RpcName = keyof Functions;
type Row<F extends RpcName> = Functions[F]['Returns'] extends (infer R)[] ? R : never;

/** Every Host OS core RPC the client may call. All host-side ones check the caller runs the program. */
export const hostRpcs = [
  // Programs
  'create_host_program',
  'my_host_programs',
  'update_host_rules',
  'add_co_host',
  'remove_co_host',
  'set_program_member',
  // HostHome
  'host_home',
  'host_needs_you',
  'host_week',
  // HostSeries
  'create_series',
  'update_series',
  'series_view',
  'series_sessions',
  'skip_session',
  'restore_session',
  'save_series_template',
  // HostRoster
  'session_view',
  'session_roster',
  'host_session_check_in',
  'promote_from_waitlist',
  'reorder_waitlist',
  'add_session_spot',
  // HostRequests (and the participant side)
  'session_requests',
  'decide_join_request',
  'undo_join_decision',
  'ask_to_join',
  'withdraw_join_request',
  // HostPeople
  'host_people_counts',
  'host_people',
  'host_person',
  'set_person_tags',
  'set_person_note',
  'invite_back',
  // HostAnnounce (and the participant side)
  'announce_context',
  'announce_recipient_count',
  'announce_templates',
  'send_announcement',
  'host_announcement_history',
  'unpin_announcement',
  'mark_announcement_read',
  'session_pinned_announcement',
] as const satisfies readonly RpcName[];

/** Host OS RPCs that take `p_idempotency_key` (also part of `idempotentRpcs`). */
export const hostIdempotentRpcs = [
  'create_host_program',
  'create_series',
  'promote_from_waitlist',
  'add_session_spot',
  'ask_to_join',
  'decide_join_request',
  'send_announcement',
] as const satisfies readonly RpcName[];

/** Stable error codes added by the Host OS core (also part of `ojoroErrorCodes`). */
export const hostErrorCodes = [
  'program_not_found',
  'not_program_host',
  'owner_required',
  'series_not_found',
  'series_invalid',
  'series_version_conflict',
  'session_not_found',
  'session_skipped',
  'session_full',
  'joining_not_open',
  'approval_required',
  'not_waitlisted',
  'request_not_found',
  'request_decided',
  'undo_expired',
  'person_not_found',
  'tag_invalid',
  'announce_no_recipients',
  'announce_push_limit',
  'announcement_not_found',
] as const;

/** Approve / decline can be undone for this many minutes. */
export const HOST_UNDO_MINUTES = 10;
/** Announcement pushes per session (logistics only). */
export const HOST_PUSHES_PER_SESSION = 2;
/** "3 or more checked-in games" auto-approve rule. */
export const HOST_EXPERIENCED_GAMES = 3;
/** Longest announcement, in characters ("92 of 280 characters"). */
export const HOST_ANNOUNCEMENT_MAX_LENGTH = 280;
/** Longest note with a join request. */
export const HOST_REQUEST_NOTE_MAX_LENGTH = 280;
/** Longest private host note on a person. */
export const HOST_NOTE_MAX_LENGTH = 1000;
/** Tags per person, and characters per tag. */
export const HOST_TAGS_MAX = 8;
export const HOST_TAG_MAX_LENGTH = 24;
/** Check-in opens this many minutes before a session (Slice 01 activities). */
export const HOST_CHECK_IN_MINUTES = 30;
/** Players per session (a host session holds more than a pickup plan's 2–12). */
export const HOST_CAPACITY_MIN = 2;
export const HOST_CAPACITY_MAX = 100;

export type HostRole = Enums['host_role'];
export type HostLevel = Enums['host_level'];
export type HostRefundWindow = Enums['host_refund_window'];
export type HostSessionStatus = Enums['host_session_status'];
export type HostRequestStatus = Enums['host_request_status'];
export type HostApprovedVia = Enums['host_approved_via'];
export type HostLogKind = Enums['host_log_kind'];
export type HostAudience = Enums['host_audience'];
export type HostPeopleFilter = 'all' | 'regulars' | 'members' | 'new' | 'drifting';

export type HostProgramRow = Tables['host_programs']['Row'];
export type HostSeriesRow = Tables['host_series']['Row'];
export type HostSessionRow = Tables['host_sessions']['Row'];
export type HostJoinRequestRow = Tables['host_join_requests']['Row'];
export type HostAnnouncementRow = Tables['host_announcements']['Row'];
export type HostJoinState = CompositeTypes['host_join_state'];
export type HostSeriesUpdate = CompositeTypes['host_series_update'];
export type HostAnnouncementState = CompositeTypes['host_announcement_state'];
export type HostNeedsYouItem = CompositeTypes['host_needs_you_item'];
export type HostWeekItem = CompositeTypes['host_week_item'];

export type MyHostProgram = WithNull<
  Row<'my_host_programs'>,
  'area' | 'sport_id' | 'next_session_at'
>;
export type HostHome = WithNull<Row<'host_home'>, 'area' | 'last30_showed_up_pct'>;
export type SeriesView = WithNull<
  Row<'series_view'>,
  'place_area' | 'until_on' | 'teams_note' | 'kit_note' | 'first_session_on' | 'applies_from'
>;
export type SeriesSession = WithNull<Row<'series_sessions'>, 'skip_reason'>;
export type SessionView = WithNull<
  Row<'session_view'>,
  | 'series_id'
  | 'place_name'
  | 'place_area'
  | 'skip_reason'
  | 'settled'
  | 'settle_total'
  | 'settle_note_user_id'
  | 'settle_note'
>;
export type RosterRow = WithNull<
  Row<'session_roster'>,
  | 'waitlist_position'
  | 'avatar_path'
  | 'team'
  | 'plays_most_dow'
  | 'joined_at'
  | 'waitlisted_at'
  | 'promoted_at'
  | 'checked_in_at'
  | 'check_in_method'
  | 'approved_at'
  | 'approved_via'
  | 'dropped_at'
  | 'replaced_by'
  | 'replaced_by_name'
  | 'replaced_at'
  | 'payment_status'
  | 'payment_label'
  | 'payment_amount_cents'
  | 'payment_detail'
>;
export type RosterSection = 'in' | 'waitlist' | 'dropped';
export type JoinRequestRow = WithNull<
  Row<'session_requests'>,
  'avatar_path' | 'area' | 'distance_km' | 'note' | 'approved_via' | 'decided_at' | 'undo_until'
>;
export type HostPersonRow = WithNull<
  Row<'host_people'>,
  'avatar_path' | 'first_came_at' | 'last_came_at' | 'invited_back_at' | 'pass_kind' | 'pass_label'
>;
export type HostPerson = WithNull<
  Row<'host_person'>,
  | 'avatar_path'
  | 'area'
  | 'first_came_at'
  | 'last_came_at'
  | 'member_since'
  | 'member_until'
  | 'my_note'
  | 'pass_kind'
  | 'pass_label'
  | 'pass_renews_on'
  | 'pass_sessions_left'
>;
export type HostPeopleCounts = Row<'host_people_counts'>;
export type AnnounceContext = Row<'announce_context'>;
export type AnnounceTemplate = Row<'announce_templates'>;
export type AnnouncementHistoryRow = WithNull<
  Row<'host_announcement_history'>,
  'session_id' | 'activity_id' | 'session_name' | 'session_starts_at' | 'template' | 'pinned_until'
>;
export type PinnedAnnouncement = WithNull<
  Row<'session_pinned_announcement'>,
  'message_id' | 'pinned_until'
>;

/** Keys `create_series` / `update_series` accept in their settings object. */
export const SERIES_SETTING_KEYS = [
  'name',
  'sport_id',
  'place_id',
  'start_time',
  'duration_minutes',
  'capacity',
  'level',
  'repeat_days',
  'starts_on',
  'until_on',
  'join_opens_days',
  'approval_required',
  'waitlist_auto_fill',
  'members_first',
  'price_cents',
  'member_price_cents',
  'currency',
  'refund_window',
  'teams_note',
  'kit_note',
] as const;
export type SeriesSettingKey = (typeof SERIES_SETTING_KEYS)[number];
export type SeriesSettings = Partial<{
  name: string;
  sport_id: string;
  place_id: string;
  /** Local wall-clock 'HH:MM' in the place's time zone. */
  start_time: string;
  duration_minutes: number;
  capacity: number;
  level: HostLevel;
  /** ISO days, 1 = Monday … 7 = Sunday. */
  repeat_days: number[];
  starts_on: string;
  until_on: string | null;
  join_opens_days: number;
  approval_required: boolean;
  waitlist_auto_fill: boolean;
  members_first: boolean;
  price_cents: number;
  /** 0 = included in membership. */
  member_price_cents: number;
  currency: string;
  refund_window: HostRefundWindow;
  teams_note: string | null;
  kit_note: string | null;
}>;

/**
 * Only the keys whose value differs from the loaded series: send this as `p_changes` with
 * `p_expected_version` so an edit never overwrites fields the host didn't touch.
 */
export function seriesChanges(
  loaded: Partial<Record<SeriesSettingKey, unknown>>,
  edited: SeriesSettings,
): SeriesSettings {
  const out: Record<string, unknown> = {};
  for (const key of SERIES_SETTING_KEYS) {
    if (!(key in edited)) continue;
    const next = (edited as Record<string, unknown>)[key];
    if (JSON.stringify(normalize(key, next)) !== JSON.stringify(normalize(key, loaded[key]))) {
      out[key] = next;
    }
  }
  return out as SeriesSettings;
}

function normalize(key: SeriesSettingKey, value: unknown): unknown {
  if (value === undefined) return null;
  if (key === 'start_time' && typeof value === 'string') return value.slice(0, 5);
  if (key === 'repeat_days' && Array.isArray(value)) return [...new Set(value)].sort();
  return value;
}

/** Words for a price in integer cents: 0 → 'Free', 800 CAD → '$8', 850 → '$8.50'. */
export function formatPrice(cents: number, currency = 'CAD'): string {
  if (cents <= 0) return 'Free';
  const symbol = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';
  const whole = cents % 100 === 0;
  return `${symbol}${whole ? String(cents / 100) : (cents / 100).toFixed(2)}`;
}

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
/** ISO day (1 = Monday) → 'Tue'. */
export function isoDayShort(day: number): string {
  return DAY_SHORT[(((day - 1) % 7) + 7) % 7] ?? '';
}
/** People rows: [2, 4] → 'Tue · Thu'. */
export function daysLabel(days: readonly number[]): string {
  return days.map(isoDayShort).join(' · ');
}

export const LEVEL_LABEL: Record<HostLevel, string> = {
  beginners: 'Beginners',
  mixed: 'Mixed',
  competitive: 'Competitive',
};

export const REFUND_WINDOW_LABEL: Record<HostRefundWindow, string> = {
  any_time: 'Any time',
  hours_12: '12 h before',
  hours_24: '24 h before',
  never: 'Never',
};

/** THIS WEEK badge for a session row. Status is in words, never colour only. */
export function weekBadge(
  item: Pick<HostWeekItem, 'kind' | 'status' | 'capacity' | 'in_count' | 'asking_count'>,
): string {
  if (item.kind !== 'session') return (item.kind ?? '').toUpperCase();
  if (item.status === 'skipped') return 'SKIPPED';
  if ((item.asking_count ?? 0) > 0) return `${item.asking_count} ASKING`;
  if ((item.capacity ?? 0) > 0 && (item.in_count ?? 0) >= (item.capacity ?? 0)) return 'FULL';
  return `${item.in_count ?? 0} / ${item.capacity ?? 0}`;
}

/** "9 of the last 12" (or fewer when there have been fewer sessions). */
export function last12Label(count: number, total: number): string {
  return `${count} of the last ${total}`;
}

/** Waitlist position as words for the person waiting: 1 → 'You're next'. */
export function waitlistWords(position: number | null): string | null {
  if (position == null) return null;
  return position <= 1 ? "You're next" : `${position - 1} ahead of you`;
}

/** Can this request's decision still be undone at `now`? */
export function canUndo(undoUntil: string | null, now: Date = new Date()): boolean {
  return undoUntil != null && new Date(undoUntil).getTime() > now.getTime();
}

/** Realtime for HostHome and the People list: sessions and announcements of one program. */
export function hostProgramSubscription(programId: string): RealtimeSubscription {
  const filter = `program_id=eq.${programId}`;
  return {
    channel: `host-program:${programId}`,
    changes: [
      { event: 'UPDATE', schema: 'public', table: 'host_programs', filter: `id=eq.${programId}` },
      { event: '*', schema: 'public', table: 'host_series', filter },
      { event: '*', schema: 'public', table: 'host_sessions', filter },
      { event: 'INSERT', schema: 'public', table: 'host_announcements', filter },
    ],
  };
}

/**
 * HostRoster / HostRequests: the session, its activity's attendance and its join requests. Treat
 * every event as a refetch hint for `session_view`, `session_roster` and `session_requests`.
 */
export function hostSessionSubscription(
  sessionId: string,
  activityId: string,
): RealtimeSubscription {
  return {
    channel: `host-session:${sessionId}`,
    changes: [
      { event: 'UPDATE', schema: 'public', table: 'host_sessions', filter: `id=eq.${sessionId}` },
      { event: 'UPDATE', schema: 'public', table: 'activities', filter: `id=eq.${activityId}` },
      { event: '*', schema: 'public', table: 'attendance', filter: `activity_id=eq.${activityId}` },
      {
        event: '*',
        schema: 'public',
        table: 'host_join_requests',
        filter: `session_id=eq.${sessionId}`,
      },
    ],
  };
}
