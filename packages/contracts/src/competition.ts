/**
 * Step 5 (Competition, PRD M6) client contract helpers: Call-Outs, Challenge Events and their crowd
 * (follow, predictions, backing, posts, comments, polls, cheers), live progress, verification,
 * Rivalries and rematches. The full contract is docs/COMPETITION_CONTRACT.md; the database shapes
 * are generated into ./database.types.ts.
 *
 * Pure TypeScript with no runtime dependencies. No money anywhere: predictions and backing are
 * social counts, never stakes, odds, payouts or points.
 */
import type { Database } from './database.types';
import type { RealtimeSubscription } from './slice01';

type Functions = Database['public']['Functions'];
type Enums = Database['public']['Enums'];
type RpcName = keyof Functions;

/** Marks columns the generated types call non-null as `T | null` (Slice 01 rule 7). */
export type WithNull<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | null };

/** Every Step 5 RPC the client may call. */
export const competitionRpcs = [
  // Call-Outs
  'create_call_out',
  'accept_call_out',
  'counter_call_out',
  'decline_call_out',
  'withdraw_call_out',
  'call_out_view',
  'my_call_outs',
  // Event page
  'challenge_event_view',
  'my_challenge_events',
  'follow_challenge_event',
  'unfollow_challenge_event',
  'predict_challenge',
  'back_challenge',
  'post_challenge_update',
  'delete_challenge_post',
  'challenge_feed',
  'comment_on_challenge',
  'delete_challenge_comment',
  'respect_challenge_comment',
  'challenge_comments',
  'react_challenge',
  'create_challenge_poll',
  'vote_challenge_poll',
  'challenge_polls',
  'propose_challenge_organizer',
  'remove_challenge_organizer',
  'join_challenge_lineup',
  'leave_challenge_lineup',
  // Event day, live, result
  'check_in_challenge',
  'ready_challenge',
  'log_challenge_progress',
  'submit_challenge_result',
  'confirm_challenge_result',
  'request_challenge_correction',
  'withdraw_challenge_correction',
  'challenge_verification',
  'cancel_challenge_event',
  'challenge_poster',
  // Rivalries and rematch
  'rivalry_view',
  'rivalry_meetings',
  'my_rivalries',
  'run_it_back_challenge',
] as const satisfies readonly RpcName[];

/** Step 5 RPCs that take `p_idempotency_key` (also part of `idempotentRpcs`). */
export const competitionIdempotentRpcs = [
  'create_call_out',
  'accept_call_out',
  'counter_call_out',
  'post_challenge_update',
  'comment_on_challenge',
  'submit_challenge_result',
  'confirm_challenge_result',
  'run_it_back_challenge',
] as const satisfies readonly RpcName[];

/** Step 5 writes that toggle: never retry blindly; refetch and compare. */
export const competitionToggleRpcs = [
  'respect_challenge_comment',
  'react_challenge',
] as const satisfies readonly RpcName[];

/** Stable error codes added in Step 5 (also part of `ojoroErrorCodes`). */
export const competitionErrorCodes = [
  'call_out_not_found',
  'call_out_not_allowed',
  'call_out_closed',
  'call_out_expired',
  'call_out_pending',
  'call_out_rate_limited',
  'challenge_event_not_found',
  'not_competitor',
  'predictions_locked',
  'prediction_not_allowed',
  'backing_closed',
  'challenge_not_live',
  'challenge_closed',
  'challenge_started',
  'lineup_full',
  'not_checked_in',
  'post_not_found',
  'comment_not_found',
  'poll_exists',
  'submission_not_found',
  'correction_open',
  'rematch_not_available',
  'organizer_not_allowed',
  'rivalry_not_found',
  'poster_not_allowed',
] as const;

/** Call-outs one person may send in 24 hours. */
export const CALL_OUTS_PER_DAY = 10;
/** WHO TAKES IT? percentages show from this many predictions (privacy threshold). */
export const PREDICTION_MIN_COUNT = 5;
/** Longest post in the hype feed, in characters. */
export const CHALLENGE_POST_MAX_LENGTH = 280;
/** Longest comment, in characters. */
export const CHALLENGE_COMMENT_MAX_LENGTH = 500;
/** Longest challenger's line (message) and course line, in characters. */
export const CALL_OUT_MESSAGE_MAX_LENGTH = 140;
/**
 * A submitted result the other side neither confirms nor corrects within this many hours is final
 * (source `unanswered_auto_confirmed`). Verifying shows `auto_confirms_at`.
 */
export const RESULT_AUTO_CONFIRM_HOURS = 48;
/** Check-in opens this many minutes before the start. */
export const CHALLENGE_CHECK_IN_MINUTES = 60;

export type ChallengeFormat = Enums['challenge_format'];
export type ChallengeScoring = Enums['challenge_scoring'];
export type ChallengeAudience = Enums['challenge_audience'];
export type ChallengeStage = Enums['challenge_stage'];
export type ChallengeStatus = Enums['challenge_status'];
export type CallOutStatus = Enums['call_out_status'];
export type ChallengePostKind = Enums['challenge_post_kind'];
export type ChallengePollTemplate = Enums['challenge_poll_template'];
export type ChallengeSide = Enums['team_side'];

export type CallOutView = Functions['call_out_view']['Returns'][number];
export type CallOutRow = Functions['my_call_outs']['Returns'][number];
export type ChallengeEventView = Functions['challenge_event_view']['Returns'][number];
export type ChallengeEventRow = Functions['my_challenge_events']['Returns'][number];
export type ChallengeFeedPost = Functions['challenge_feed']['Returns'][number];
export type ChallengeComment = Functions['challenge_comments']['Returns'][number];
export type ChallengePoll = Functions['challenge_polls']['Returns'][number];
export type ChallengeVerification = Functions['challenge_verification']['Returns'][number];
export type ChallengePoster = Functions['challenge_poster']['Returns'][number];
/**
 * `rivalry_view`. The generated types say every column is non-null; these can be null (no
 * meetings yet, no next event, no pending rematch).
 */
export type RivalryView = WithNull<
  Functions['rivalry_view']['Returns'][number],
  | 'streak_side'
  | 'last_event_id'
  | 'last_winner'
  | 'last_margin'
  | 'last_scoring'
  | 'last_unit'
  | 'last_title'
  | 'next_event_id'
  | 'next_title'
  | 'next_starts_at'
  | 'next_time_zone'
  | 'next_stage'
  | 'rematch_call_out_id'
  | 'rematch_from'
  | 'rematch_from_name'
  | 'rematch_message'
  | 'rematch_title'
  | 'rematch_starts_at'
  | 'rematch_of_event_id'
>;
/** `rivalry_meetings`: the place and unit can be null. */
export type RivalryMeeting = WithNull<
  Functions['rivalry_meetings']['Returns'][number],
  'place_name' | 'unit'
>;
/** `my_rivalries`: the next event, last activity and one of the two opponent ids can be null. */
export type RivalryRow = WithNull<
  Functions['my_rivalries']['Returns'][number],
  | 'next_event_id'
  | 'next_title'
  | 'next_starts_at'
  | 'next_time_zone'
  | 'last_active_at'
  | 'opponent_user_id'
  | 'opponent_crew_id'
>;

/** One row of `challenge_verification().checks`. */
export interface VerificationCheck {
  kind: 'confirmation';
  user_id: string;
  name: string;
  side: ChallengeSide;
  is_me: boolean;
  done: boolean;
  done_at: string | null;
}

/** The design system's situation for a stage (ChallengeEventHero), same as the server's. */
export type Situation = 'calm' | 'forming' | 'confirmed' | 'live' | 'after';
export function situationForStage(stage: ChallengeStage): Situation {
  switch (stage) {
    case 'accepted':
    case 'days':
      return 'forming';
    case 'today':
    case 'soon':
      return 'confirmed';
    case 'live':
      return 'live';
    case 'cancelled':
      return 'calm';
    default:
      return 'after';
  }
}

/** Which screen shows an event at a stage (`/event/[id]` switches on it). */
export type EventScreen = 'EventBuildup' | 'EventToday' | 'EventLive' | 'Verifying' | 'Result';
export function screenForStage(stage: ChallengeStage): EventScreen {
  switch (stage) {
    case 'today':
    case 'soon':
      return 'EventToday';
    case 'live':
      return 'EventLive';
    case 'verifying':
    case 'disputed':
      return 'Verifying';
    case 'complete':
      return 'Result';
    default:
      return 'EventBuildup';
  }
}

/**
 * Countdown parts to the start on the server's clock (`server_now` from `challenge_event_view`).
 * Seconds only matter in the last hour (Countdown spec). Null once the start has passed.
 */
export function challengeCountdown(
  state: { server_now: string; starts_at: string },
  receivedAt: Date,
  now: Date = new Date(),
): { days: number; hours: number; minutes: number; seconds: number } | null {
  const serverNow = Date.parse(state.server_now) + (now.getTime() - receivedAt.getTime());
  const left = Math.floor((Date.parse(state.starts_at) - serverNow) / 1000);
  if (left <= 0) return null;
  return {
    days: Math.floor(left / 86400),
    hours: Math.floor((left % 86400) / 3600),
    minutes: Math.floor((left % 3600) / 60),
    seconds: left % 60,
  };
}

/** "22:48", "1:02:03" for time scoring (seconds); "3.4 km"; "3 rounds". */
export function formatChallengeValue(
  value: number | null | undefined,
  scoring: ChallengeScoring,
  unit?: string | null,
): string | null {
  if (value === null || value === undefined) return null;
  if (scoring === 'time') {
    const s = Math.round(value);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  }
  if (scoring === 'distance') return `${value.toFixed(1)} km`;
  return unit ? `${Math.round(value)} ${unit}` : String(Math.round(value));
}

/** The margin in words for a recap ("43 seconds", "1:02", "0.3 km", "2"). */
export function formatMargin(margin: number, scoring: ChallengeScoring): string {
  if (scoring === 'time') {
    const s = Math.round(margin);
    if (s < 60) return `${s} second${s === 1 ? '' : 's'}`;
    return formatChallengeValue(s, 'time') ?? '';
  }
  if (scoring === 'distance') return `${margin.toFixed(1)} km`;
  return String(Math.round(margin));
}

/** Rivalry form cell: the winner's initial, or = for a draw (Rivalry component). */
export function formCells(
  form: readonly string[],
  aName: string,
  bName: string,
): { side: 'a' | 'b' | 'd'; label: string }[] {
  return form.map((f) =>
    f === 'a'
      ? { side: 'a', label: (aName.trim()[0] ?? 'A').toUpperCase() }
      : f === 'b'
        ? { side: 'b', label: (bName.trim()[0] ?? 'B').toUpperCase() }
        : { side: 'd', label: '=' },
  );
}

/** "The crowd called it" / "The crowd got it wrong" / null (draw, tie or too few predictions). */
export function crowdOutcome(
  calledIt: boolean | null | undefined,
): 'called_it' | 'got_it_wrong' | null {
  if (calledIt === true) return 'called_it';
  if (calledIt === false) return 'got_it_wrong';
  return null;
}

// Realtime ---------------------------------------------------------------------------------------

/**
 * A Challenge Event page (all stages): the event row (stage, counts, live progress), check-ins,
 * the feed, comments, polls and (competitors only, by RLS) result submissions.
 */
export function challengeEventSubscription(eventId: string): RealtimeSubscription {
  const filter = `event_id=eq.${eventId}`;
  return {
    channel: `challenge:${eventId}`,
    changes: [
      { event: 'UPDATE', schema: 'public', table: 'challenge_events', filter: `id=eq.${eventId}` },
      { event: '*', schema: 'public', table: 'challenge_competitors', filter },
      { event: 'INSERT', schema: 'public', table: 'challenge_posts', filter },
      { event: 'UPDATE', schema: 'public', table: 'challenge_posts', filter },
      { event: 'INSERT', schema: 'public', table: 'challenge_comments', filter },
      { event: 'UPDATE', schema: 'public', table: 'challenge_comments', filter },
      { event: '*', schema: 'public', table: 'challenge_polls', filter },
      { event: '*', schema: 'public', table: 'challenge_result_submissions', filter },
    ],
  };
}

/** CallOut screen: the call-out's status (accepted, countered, passed, withdrawn). */
export function callOutSubscription(callOutId: string): RealtimeSubscription {
  return {
    channel: `call-out:${callOutId}`,
    changes: [
      { event: 'UPDATE', schema: 'public', table: 'call_outs', filter: `id=eq.${callOutId}` },
    ],
  };
}

/** Compete: call-outs to you and from you. Crew call-outs arrive through notifications. */
export function callOutsSubscription(userId: string): RealtimeSubscription {
  return {
    channel: `call-outs:${userId}`,
    changes: [
      { event: '*', schema: 'public', table: 'call_outs', filter: `opponent_id=eq.${userId}` },
      { event: '*', schema: 'public', table: 'call_outs', filter: `challenger_id=eq.${userId}` },
    ],
  };
}

/**
 * Rivalry (and Compete's rivalry block): a new or answered rematch call-out, and events of this
 * rivalry changing stage (a result makes the record change). Refetch `rivalry_view` and
 * `rivalry_meetings` on any change.
 */
export function rivalrySubscription(rivalryId: string): RealtimeSubscription {
  const filter = `rivalry_id=eq.${rivalryId}`;
  return {
    channel: `rivalry:${rivalryId}`,
    changes: [
      { event: '*', schema: 'public', table: 'call_outs', filter },
      { event: '*', schema: 'public', table: 'challenge_events', filter },
    ],
  };
}
