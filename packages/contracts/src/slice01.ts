/**
 * Slice 01 client contract helpers. The full contract is docs/SLICE01_CONTRACT.md; the database
 * shapes are generated into ./database.types.ts (`pnpm db:types`).
 *
 * Pure TypeScript with no runtime dependencies, so it runs in the app, in tests and in Node.
 */
import type { Database } from './database.types';
import { liquidityErrorCodes } from './liquidity';
import { messagingErrorCodes } from './messaging';
import { competitionErrorCodes } from './competition';
import { hostErrorCodes } from './hosts';
import { communitiesErrorCodes } from './communities';
import { hostOpsErrorCodes } from './hostsOps';
import { passportErrorCodes } from './passport';

type PublicSchema = Database['public'];
export type RpcName = keyof PublicSchema['Functions'];
export type RpcArgs<N extends RpcName> = PublicSchema['Functions'][N]['Args'];
export type RpcReturns<N extends RpcName> = PublicSchema['Functions'][N]['Returns'];
export type PlanStatus = PublicSchema['Enums']['plan_status'];
export type ActivityStatus = PublicSchema['Enums']['activity_status'];

/**
 * Every RPC the Slice 01 client may call. `satisfies` makes `pnpm typecheck` fail if a function is
 * renamed or dropped in the database and the generated types are refreshed.
 */
export const slice01Rpcs = [
  // Profile and onboarding
  'save_onboarding',
  'update_profile',
  'set_pull_me_in',
  'profile_view',
  'profile_sports',
  'profile_reputation',
  'availability_overlap',
  // Safety
  'block_user',
  'unblock_user',
  'my_blocks',
  'report',
  // Down For
  'create_down_for',
  'withdraw_down_for',
  'down_for_nearby',
  // Plans
  'create_plan',
  'im_down',
  'leave_plan',
  'cancel_plan',
  'vote_time',
  'propose_time',
  'plan_roster',
  'plans_nearby',
  'still_on_nearby',
  // Need One More / Pull Someone In
  'pull_in',
  'pull_in_quota',
  'pull_in_candidates',
  'decline_invite',
  // Activity and attendance
  'join_waitlist',
  'cancel_attendance',
  'check_in',
  'host_check_in',
  'assign_team',
  'start_activity',
  'end_activity',
  'cancel_activity',
  'activity_roster',
  'share_location',
  'stop_sharing_location',
  // After, Recap, Run It Back
  'propose_result',
  'confirm_result',
  'add_moment',
  'untag_me',
  'remove_moment',
  'give_reputation',
  'recap_people',
  'recap_for_me',
  'run_it_back',
] as const satisfies readonly RpcName[];

/** RPCs that take `p_idempotency_key`. Make one uuid per user intent; reuse it on every retry. */
export const idempotentRpcs = [
  'create_plan',
  'im_down',
  'leave_plan',
  'pull_in',
  'create_down_for',
  'join_waitlist',
  'cancel_attendance',
  'check_in',
  'propose_result',
  'confirm_result',
  'run_it_back',
  // Step 3 (liquidity.ts)
  'create_from_demand',
  // Step 4 (messaging.ts)
  'create_crew',
  'send_message',
  'make_this_a_game',
  'post_update',
  // Step 5 (competition.ts)
  'create_call_out',
  'accept_call_out',
  'counter_call_out',
  'post_challenge_update',
  'comment_on_challenge',
  'submit_challenge_result',
  'confirm_challenge_result',
  'run_it_back_challenge',
  // Step 6: Host OS core (hosts.ts)
  'create_host_program',
  'create_series',
  'promote_from_waitlist',
  'add_session_spot',
  'ask_to_join',
  'decide_join_request',
  'send_announcement',
  // Step 6: Communities (communities.ts)
  'join_down_for',
  'create_ritual',
  'create_clan',
  'create_clan_run',
  'create_clash',
  'submit_clash_result',
  // Step 6: Host OS operations (hostsOps.ts)
  'create_host_pass',
  'grant_host_pass',
  'mark_paid_at_field',
  'decide_host_refund',
  'request_host_refund',
  'cancel_host_membership',
  'create_host_league',
  'generate_host_league_fixtures',
  'schedule_host_league_fixture',
  'submit_league_result',
  'confirm_league_result',
  'ask_league_referee',
  // Step 7: Passport (passport.ts)
  'set_goal',
] as const satisfies readonly RpcName[];

/** Stable error codes raised by the database (SQLSTATE P0001; the code is `error.message`). */
export const ojoroErrorCodes = [
  'not_authenticated',
  'idempotency_key_required',
  'idempotency_key_reused',
  'invalid_argument',
  'user_not_found',
  'subject_not_found',
  'report_rate_limited',
  'handle_taken',
  'radius_invalid',
  'sport_unknown',
  'place_unknown',
  'capacity_invalid',
  'starts_at_invalid',
  'deadline_invalid',
  'time_options_invalid',
  'expiry_required',
  'expiry_invalid',
  'window_invalid',
  'signal_not_found',
  'plan_not_found',
  'plan_unavailable',
  'plan_full',
  'plan_expired',
  'plan_cancelled',
  'plan_locked',
  'not_member',
  'not_host',
  'poll_closed',
  'option_not_found',
  'invite_not_allowed',
  'invite_quota_exceeded',
  'invite_rate_limited',
  'invite_not_found',
  'activity_not_found',
  'activity_cancelled',
  'activity_started',
  'activity_not_live',
  'activity_not_finished',
  'not_attending',
  'check_in_not_open',
  'check_in_closed',
  'check_in_unavailable',
  'location_required',
  'too_far',
  'share_not_allowed',
  'not_player',
  'result_not_open',
  'result_already_verified',
  'proposal_not_found',
  'proposal_superseded',
  'moments_closed',
  'moment_path_invalid',
  'not_author',
  // Step 3: Liquidity (liquidity.ts, docs/LIQUIDITY_CONTRACT.md)
  ...liquidityErrorCodes,
  // Step 4: Messaging and feed (messaging.ts, docs/MESSAGING_CONTRACT.md)
  ...messagingErrorCodes,
  // Step 5: Competition (competition.ts, docs/COMPETITION_CONTRACT.md)
  ...competitionErrorCodes,
  // Step 6: Host OS core (hosts.ts, docs/HOSTS_CONTRACT.md)
  ...hostErrorCodes,
  // Step 6: Communities (communities.ts, docs/COMMUNITIES_CONTRACT.md)
  ...communitiesErrorCodes,
  // Step 6: Host OS operations (hostsOps.ts, docs/HOSTS_OPS_CONTRACT.md)
  ...hostOpsErrorCodes,
  // Step 7: Passport (passport.ts, docs/PASSPORT_CONTRACT.md)
  ...passportErrorCodes,
] as const;

export type OjoroErrorCode = (typeof ojoroErrorCodes)[number];

/** What the UI gets from any failed call: a stable code to map to words, plus the detail value. */
export type OjoroError =
  | { kind: 'ojoro'; code: OjoroErrorCode; detail: string | null }
  | { kind: 'permission'; code: 'permission_denied'; detail: string | null }
  | { kind: 'network'; code: 'network'; detail: string | null }
  | { kind: 'unknown'; code: 'unknown'; detail: string | null };

const codeSet: ReadonlySet<string> = new Set(ojoroErrorCodes);

export function isOjoroErrorCode(value: unknown): value is OjoroErrorCode {
  return typeof value === 'string' && codeSet.has(value);
}

function field(err: object, key: string): string | null {
  const value = (err as Record<string, unknown>)[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * Normalize a supabase-js / PostgREST error (`{ code, message, details, hint }`) or a thrown
 * fetch error into an OjoroError. Never throws.
 */
export function toOjoroError(err: unknown): OjoroError {
  if (err === null || typeof err !== 'object') {
    return { kind: 'unknown', code: 'unknown', detail: typeof err === 'string' ? err : null };
  }
  const code = field(err, 'code');
  const message = field(err, 'message');
  const detail = field(err, 'details') ?? field(err, 'detail');
  if (code === 'P0001' && isOjoroErrorCode(message)) {
    return { kind: 'ojoro', code: message, detail };
  }
  if (code === '42501' || code === 'PGRST301' || code === '401' || code === '403') {
    return { kind: 'permission', code: 'permission_denied', detail: message };
  }
  const name = field(err, 'name');
  if (
    name === 'TypeError' ||
    name === 'AbortError' ||
    (message !== null && /network|failed to fetch|timed? ?out/i.test(message))
  ) {
    return { kind: 'network', code: 'network', detail: message };
  }
  return { kind: 'unknown', code: 'unknown', detail: message };
}

/** Errors worth retrying with the same idempotency key (the first call may or may not have landed). */
export function isRetryable(error: OjoroError): boolean {
  return error.kind === 'network';
}

// Time rules -------------------------------------------------------------------------------------
// Same rules as the plan_cards / activity_cards views, for rendering last-known state offline.

export interface PlanTiming {
  status: PlanStatus;
  deadline_at: string;
}

export function effectivePlanStatus(plan: PlanTiming, now: Date = new Date()): PlanStatus {
  if (plan.status === 'forming' && Date.parse(plan.deadline_at) <= now.getTime()) return 'expired';
  return plan.status;
}

export interface ActivityTiming {
  status: ActivityStatus;
  starts_at: string;
  ends_at: string;
  live_at: string | null;
  ended_at: string | null;
  after_closes_at: string;
}

export function effectiveActivityStatus(
  activity: ActivityTiming,
  now: Date = new Date(),
): ActivityStatus {
  const t = now.getTime();
  if (activity.status === 'cancelled') return 'cancelled';
  if (activity.status === 'complete' || Date.parse(activity.after_closes_at) <= t)
    return 'complete';
  if (Date.parse(activity.ended_at ?? activity.ends_at) <= t) return 'after';
  if (Date.parse(activity.live_at ?? activity.starts_at) <= t) return 'live';
  return 'confirmed';
}

export interface CheckInWindow {
  check_in_opens_at: string;
  check_in_closes_at: string;
}

/** 'early' before it opens, 'open' inside the window, 'closed' after. */
export function checkInWindowState(
  activity: CheckInWindow,
  now: Date = new Date(),
): 'early' | 'open' | 'closed' {
  const t = now.getTime();
  if (t < Date.parse(activity.check_in_opens_at)) return 'early';
  if (t >= Date.parse(activity.check_in_closes_at)) return 'closed';
  return 'open';
}

// Realtime ---------------------------------------------------------------------------------------
// postgres_changes subscriptions (RLS applies). Pass each entry to
// `channel.on('postgres_changes', entry, handler)`.

export interface PostgresChangesFilter {
  event: '*' | 'INSERT' | 'UPDATE' | 'DELETE';
  schema: 'public';
  table: string;
  filter?: string;
}

export interface RealtimeSubscription {
  channel: string;
  changes: PostgresChangesFilter[];
}

/** Plan screen: count, status (GAME ON), new members, poll counts. */
export function planSubscription(planId: string): RealtimeSubscription {
  return {
    channel: `plan:${planId}`,
    changes: [
      { event: 'UPDATE', schema: 'public', table: 'plans', filter: `id=eq.${planId}` },
      { event: 'INSERT', schema: 'public', table: 'plan_members', filter: `plan_id=eq.${planId}` },
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'plan_time_options',
        filter: `plan_id=eq.${planId}`,
      },
    ],
  };
}

/** Activity, check-in, live and after screens. */
export function activitySubscription(activityId: string): RealtimeSubscription {
  const filter = `activity_id=eq.${activityId}`;
  return {
    channel: `activity:${activityId}`,
    changes: [
      { event: 'UPDATE', schema: 'public', table: 'activities', filter: `id=eq.${activityId}` },
      { event: '*', schema: 'public', table: 'attendance', filter },
      { event: '*', schema: 'public', table: 'location_shares', filter },
      { event: '*', schema: 'public', table: 'result_proposals', filter },
      { event: 'INSERT', schema: 'public', table: 'moments', filter },
      { event: '*', schema: 'public', table: 'recaps', filter },
    ],
  };
}

/** Invites addressed to the signed-in user (Pull Someone In, Run It Back). */
export function invitesSubscription(userId: string): RealtimeSubscription {
  return {
    channel: `invites:${userId}`,
    changes: [
      { event: '*', schema: 'public', table: 'plan_invites', filter: `invitee_id=eq.${userId}` },
    ],
  };
}

/** Pull-in invites left for one person on one plan. */
export const PULL_IN_QUOTA = 3;
/** Check-in radius in metres (the activity row carries the value actually used). */
export const CHECK_IN_RADIUS_M = 150;
/** Reputation signals show from this many confirmations. */
export const REPUTATION_THRESHOLD = 5;
