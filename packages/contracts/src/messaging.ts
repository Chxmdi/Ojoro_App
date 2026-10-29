/**
 * Step 4 (Messaging and feed, PRD M5) client contract helpers: notifications, crews, chat, Make
 * This a Game, Live and the action feed. The full contract is docs/MESSAGING_CONTRACT.md; the
 * database shapes are generated into ./database.types.ts.
 *
 * Pure TypeScript with no runtime dependencies.
 */
import type { Database } from './database.types';
import type { RealtimeSubscription } from './slice01';

type Functions = Database['public']['Functions'];
type Enums = Database['public']['Enums'];
type RpcName = keyof Functions;

/**
 * Every Step 4 RPC the client may call. `satisfies` makes `pnpm typecheck` fail if a function is
 * renamed or dropped in the database and the generated types are refreshed.
 */
export const messagingRpcs = [
  // Notifications (Updates, the bell)
  'my_notifications',
  'unread_count',
  'mark_notifications_read',
  'act_on_notification',
  'notification_preferences',
  'set_notification_preferences',
  'set_notification_type',
  'mute_object',
  'unmute_object',
  'register_push_token',
  'unregister_push_token',
  // Crews
  'create_crew',
  'add_crew_members',
  'crew_invite_code',
  'join_crew',
  'leave_crew',
  'remove_crew_member',
  'transfer_crew_ownership',
  'set_crew_role',
  'my_crews',
  'crew_view',
  'crew_roster',
  // Chat
  'send_message',
  'crew_messages',
  'activity_messages',
  'edit_message',
  'delete_message',
  // Make This a Game
  'chat_suggestions',
  'dismiss_suggestion',
  'make_this_a_game',
  // Live
  'log_score',
  'post_update',
  'delete_update',
  'react',
  'follow_activity',
  'unfollow_activity',
  'activity_live',
  'activity_updates_feed',
  // Main
  'home_feed',
] as const satisfies readonly RpcName[];

/** Step 4 RPCs that take `p_idempotency_key` (also part of `idempotentRpcs`). */
export const messagingIdempotentRpcs = [
  'create_crew',
  'send_message',
  'make_this_a_game',
  'post_update',
] as const satisfies readonly RpcName[];

/** Step 4 reads that are VOLATILE (they run detection): call with POST, never `{ get: true }`. */
export const messagingVolatileReadRpcs = ['chat_suggestions'] as const satisfies readonly RpcName[];

/** Stable error codes added in Step 4 (also part of `ojoroErrorCodes`). */
export const messagingErrorCodes = [
  'crew_not_found',
  'not_crew_member',
  'not_crew_admin',
  'cannot_remove_owner',
  'owner_must_transfer',
  'crew_full',
  'crew_member_not_allowed',
  'crew_rate_limited',
  'invite_code_invalid',
  'message_not_found',
  'message_invalid',
  'message_rate_limited',
  'chat_closed',
  'suggestion_not_found',
  'suggestion_expired',
  'not_scorekeeper',
  'update_not_found',
  'notification_not_found',
  'push_token_invalid',
] as const;

/** Messages per person per minute (send_message). */
export const MESSAGES_PER_MINUTE = 20;
/** Live updates per person per minute (post_update). */
export const LIVE_UPDATES_PER_MINUTE = 6;
/** Longest chat message, in characters. */
export const MESSAGE_MAX_LENGTH = 1000;
/** Longest live update, in characters. */
export const LIVE_UPDATE_MAX_LENGTH = 280;
/** Biggest crew. */
export const CREW_MAX_MEMBERS = 50;
/** A repeated threshold-type push goes at most once per bundle in this many minutes. */
export const PUSH_THROTTLE_MINUTES = 30;
/** home_feed returns at most this many cards before the caught_up card. */
export const HOME_FEED_MAX_CARDS = 12;

export type NotificationType = Enums['notification_type'];
export type NotificationObject = Enums['notification_object'];
export type ReactionWord = Enums['reaction_word'];
export type CrewRole = Enums['crew_role'];
export type UpdateKind = Enums['update_kind'];

export type NotificationRow = Functions['my_notifications']['Returns'][number];
export type NotificationSection = 'needs_you' | 'today' | 'earlier';
/** What a notification's inline button does. Call the RPC named, then `act_on_notification`. */
export type NotificationAction =
  | 'im_down'
  | 'pull_in'
  | 'vote'
  | 'check_in'
  | 'confirm_result'
  | 'reply'
  // Step 5: confirm a Challenge result (open `href`, the Verifying screen).
  | 'confirm_challenge'
  | 'open';
export type HomeFeedCard = Functions['home_feed']['Returns'][number];
export type HomeFeedCardKind =
  | 'needs_you'
  | 'your_plan'
  | 'crew_suggestion'
  | 'crew_plan'
  | 'plan_forming'
  | 'down_for'
  | 'recap'
  | 'caught_up';
export type ChatMessage = Functions['crew_messages']['Returns'][number];
export type ChatSuggestion = Functions['chat_suggestions']['Returns'][number];
export type LiveState = Functions['activity_live']['Returns'][number];
export type LiveUpdate = Functions['activity_updates_feed']['Returns'][number];

/** ReactionBar words, in order, with the words the UI shows. */
export const reactionWords = [
  { value: 'lets_go', label: 'LET’S GO' },
  { value: 'respect', label: 'RESPECT' },
  { value: 'hold_that', label: 'HOLD THAT' },
  { value: 'run_it_back', label: 'RUN IT BACK' },
] as const satisfies readonly { value: ReactionWord; label: string }[];

/** Group my_notifications() rows into the three Updates sections, keeping the server order. */
export function groupNotifications<T extends { section: string }>(
  rows: readonly T[],
): Record<NotificationSection, T[]> {
  const out: Record<NotificationSection, T[]> = { needs_you: [], today: [], earlier: [] };
  for (const row of rows) {
    const key = (row.section in out ? row.section : 'earlier') as NotificationSection;
    out[key].push(row);
  }
  return out;
}

/**
 * Seconds since the last live change, measured on the server's clock ("Updated 20 s ago"). Pass
 * the `server_now` and `last_update_at` from `activity_live()` and the device time when the
 * response arrived; the result keeps counting from there without trusting the device clock.
 */
export function liveFreshnessSeconds(
  state: { server_now: string; last_update_at: string | null },
  receivedAt: Date,
  now: Date = new Date(),
): number | null {
  if (!state.last_update_at) return null;
  const serverNow = Date.parse(state.server_now) + (now.getTime() - receivedAt.getTime());
  return Math.max(0, Math.round((serverNow - Date.parse(state.last_update_at)) / 1000));
}

/** The live clock ("34:12"): seconds since `live_at`, on the server's clock. */
export function liveClockSeconds(
  state: { server_now: string; live_at: string | null },
  receivedAt: Date,
  now: Date = new Date(),
): number | null {
  if (!state.live_at) return null;
  const serverNow = Date.parse(state.server_now) + (now.getTime() - receivedAt.getTime());
  return Math.max(0, Math.floor((serverNow - Date.parse(state.live_at)) / 1000));
}

// Realtime ---------------------------------------------------------------------------------------

/** Updates and the bell: your notifications (new rows and bundled updates). */
export function notificationsSubscription(userId: string): RealtimeSubscription {
  return {
    channel: `notifications:${userId}`,
    changes: [
      {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_id=eq.${userId}`,
      },
    ],
  };
}

/** CrewChat (and CrewHome): messages, the Make This a Game suggestion, members. */
export function crewChatSubscription(crewId: string): RealtimeSubscription {
  const filter = `crew_id=eq.${crewId}`;
  return {
    channel: `crew:${crewId}`,
    changes: [
      { event: 'INSERT', schema: 'public', table: 'messages', filter },
      { event: 'UPDATE', schema: 'public', table: 'messages', filter },
      { event: '*', schema: 'public', table: 'chat_suggestions', filter },
      { event: '*', schema: 'public', table: 'crew_members', filter },
    ],
  };
}

/** LiveActivity: score, freshness, followers, game reactions, the updates feed, status. */
export function activityLiveSubscription(activityId: string): RealtimeSubscription {
  const filter = `activity_id=eq.${activityId}`;
  return {
    channel: `live:${activityId}`,
    changes: [
      { event: 'UPDATE', schema: 'public', table: 'activities', filter: `id=eq.${activityId}` },
      { event: '*', schema: 'public', table: 'activity_live', filter },
      { event: 'INSERT', schema: 'public', table: 'activity_updates', filter },
      { event: 'UPDATE', schema: 'public', table: 'activity_updates', filter },
    ],
  };
}

/** Activity chat (people in the game only). */
export function activityChatSubscription(activityId: string): RealtimeSubscription {
  const filter = `activity_id=eq.${activityId}`;
  return {
    channel: `activity-chat:${activityId}`,
    changes: [
      { event: 'INSERT', schema: 'public', table: 'messages', filter },
      { event: 'UPDATE', schema: 'public', table: 'messages', filter },
    ],
  };
}
