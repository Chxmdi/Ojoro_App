/**
 * Step 6 (Communities, PRD M7) client contract helpers: Crew Home (Crew Momentum, free tonight, the
 * Down For board, Rituals, crew vs crew, memories), Clans (identity, roles, joining, club runs, the
 * monthly mission, the clan-only leaderboard) and Ojoro Clash (clan vs clan: score, your part, the
 * events, squads, results, crowd support, standings). The full contract is
 * docs/COMMUNITIES_CONTRACT.md; the database shapes are generated into ./database.types.ts.
 *
 * Pure TypeScript with no runtime dependencies. Availability is overlap only; backing is a count
 * that never changes a score (no stakes, no prizes).
 */
import type { Database } from './database.types';
import type { RealtimeSubscription } from './slice01';
import type { WithNull } from './competition';

type Functions = Database['public']['Functions'];
type Enums = Database['public']['Enums'];
type Tables = Database['public']['Tables'];
type RpcName = keyof Functions;

/** Every Step 6 communities RPC the client may call. */
export const communitiesRpcs = [
  // Crew Home
  'crew_home',
  'crew_free_tonight',
  'crew_down_for',
  'join_down_for',
  'crew_rituals',
  'crew_versus',
  'crew_rivalries',
  'crew_memories',
  'set_crew_rhythm',
  'mark_crew_chat_read',
  // Rituals (crews and clans)
  'create_ritual',
  'update_ritual',
  'set_ritual_paused',
  'skip_ritual_week',
  'end_ritual',
  // Clans
  'create_clan',
  'update_clan',
  'my_clans',
  'clan_view',
  'clan_roles',
  'clan_roster',
  'clan_requests',
  'clan_leaderboard',
  'clan_mission',
  'set_clan_mission',
  'join_clan',
  'join_clan_with_code',
  'withdraw_clan_request',
  'decide_clan_request',
  'clan_invite_code',
  'leave_clan',
  'remove_clan_member',
  'set_clan_role',
  'transfer_clan_captaincy',
  'set_clan_leaderboard',
  // Club runs
  'clan_week',
  'clan_run_view',
  'create_clan_run',
  'join_clan_run',
  'leave_clan_run',
  'check_in_clan_run',
  'mark_clan_run_attendance',
  'cancel_clan_run',
  // Ojoro Clash
  'create_clash',
  'accept_clash',
  'decline_clash',
  'cancel_clash',
  'propose_clash_organizer',
  'clash_view',
  'clash_events_list',
  'clash_my_part',
  'clan_clashes',
  'clash_season_standings',
  'join_clash_squad',
  'leave_clash_squad',
  'submit_clash_result',
  'confirm_clash_result',
  'back_clash',
] as const satisfies readonly RpcName[];

/** Step 6 communities RPCs that take `p_idempotency_key` (also part of `idempotentRpcs`). */
export const communitiesIdempotentRpcs = [
  'join_down_for',
  'create_ritual',
  'create_clan',
  'create_clan_run',
  'create_clash',
  'submit_clash_result',
] as const satisfies readonly RpcName[];

/** Stable error codes added by Step 6 communities (also part of `ojoroErrorCodes`). */
export const communitiesErrorCodes = [
  'ritual_not_found',
  'ritual_limit',
  'ritual_week_locked',
  'clan_not_found',
  'not_clan_member',
  'clan_role_required',
  'clan_full',
  'clan_rate_limited',
  'clan_invite_only',
  'clan_request_not_found',
  'captain_must_transfer',
  'cannot_remove_captain',
  'clan_run_not_found',
  'clan_run_full',
  'clan_run_closed',
  'clash_not_found',
  'clash_not_allowed',
  'clash_pending',
  'clash_closed',
  'not_clash_captain',
  'clash_event_not_found',
  'clash_event_started',
  'clash_event_not_started',
  'squad_full',
] as const;

/** Active (or paused) Rituals one crew may have. */
export const CREW_RITUALS_MAX = 3;
/** Active (or paused) Rituals one clan may have. */
export const CLAN_RITUALS_MAX = 14;
/** Weeks of rhythm Crew Momentum shows (oldest first, this week last). */
export const MOMENTUM_WEEKS = 8;
/** Club runs hold up to this many people. */
export const CLAN_RUN_CAPACITY_MAX = 500;
/** Check in to a club run within this many metres of its place (the position is never stored). */
export const CLAN_RUN_CHECK_IN_RADIUS_M = 300;
/** Club-run check-in opens this many minutes before the start. */
export const CLAN_RUN_CHECK_IN_MINUTES = 30;
/** Clans one person may start in 24 hours. */
export const CLANS_PER_DAY = 3;
/** Biggest clan. */
export const CLAN_MAX_MEMBERS = 2000;
/** Events in one Clash (the design has six). */
export const CLASH_EVENTS_MAX = 12;

export type ClanRole = Enums['clan_role'];
export type ClanJoinPolicy = Enums['clan_join_policy'];
export type ClanRequestStatus = Enums['clan_request_status'];
export type ClanRunStatus = Enums['clan_run_status'];
export type ClanRunStage = Enums['clan_run_stage'];
export type MissionMetric = Enums['mission_metric'];
export type RitualStatus = Enums['ritual_status'];
export type ClashStatus = Enums['clash_status'];
export type ClashStage = Enums['clash_stage'];
export type ClashScoring = Enums['clash_scoring'];
export type ClashResultSource = Enums['clash_result_source'];
export type ClashEventState = Enums['clash_event_state'];

export type RitualRow = Tables['rituals']['Row'];
export type ClanRow = Tables['clans']['Row'];
export type ClanMissionRow = Tables['clan_missions']['Row'];

/** `crew_home`. Null when nothing is next, nothing to suggest, or no messages yet. */
export type CrewHome = WithNull<
  Functions['crew_home']['Returns'][number],
  | 'sport_id'
  | 'next_plan_id'
  | 'next_sport_id'
  | 'next_title'
  | 'next_starts_at'
  | 'next_place_name'
  | 'next_member_count'
  | 'next_capacity'
  | 'next_status'
  | 'next_i_am_in'
  | 'next_ritual_id'
  | 'last_message_at'
  | 'suggest_sport_id'
  | 'suggest_day_of_week'
  | 'suggest_local_time'
  | 'suggest_place_id'
  | 'suggest_place_name'
  | 'suggest_weeks'
>;
export type CrewFreeTonight = WithNull<Functions['crew_free_tonight']['Returns'][number], 'avatar_path'>;
export type CrewDownFor = WithNull<
  Functions['crew_down_for']['Returns'][number],
  'avatar_path' | 'matched_plan_id'
>;
export type CrewRitual = WithNull<
  Functions['crew_rituals']['Returns'][number],
  | 'place_id'
  | 'place_name'
  | 'host_name'
  | 'week_plan_id'
  | 'week_member_count'
  | 'week_capacity'
  | 'week_status'
  | 'week_i_am_in'
>;
export type CrewVersus = WithNull<
  Functions['crew_versus']['Returns'][number],
  'opponent_name' | 'place_name' | 'our_value' | 'their_value' | 'outcome'
>;
export type CrewRivalry = WithNull<
  Functions['crew_rivalries']['Returns'][number],
  'opponent_name' | 'last_met_at' | 'next_event_id' | 'next_starts_at'
>;
export type CrewMemory = WithNull<
  Functions['crew_memories']['Returns'][number],
  | 'place_name'
  | 'team_a_label'
  | 'team_b_label'
  | 'team_a_score'
  | 'team_b_score'
  | 'moment_id'
  | 'moment_path'
  | 'moment_alt'
  | 'moment_caption'
>;

export type ClanView = WithNull<
  Functions['clan_view']['Returns'][number],
  | 'tagline'
  | 'sport_id'
  | 'area'
  | 'city'
  | 'my_role'
  | 'my_role_note'
  | 'on_leaderboard'
  | 'request_status'
  | 'pending_requests'
>;
export type MyClan = WithNull<Functions['my_clans']['Returns'][number], 'sport_id'>;
export type ClanRun = WithNull<
  Functions['clan_week']['Returns'][number],
  'ritual_id' | 'place_id' | 'place_name' | 'place_area' | 'distance_km' | 'host_name'
>;
export type ClanMission = WithNull<Functions['clan_mission']['Returns'][number], 'my_share'>;
export type ClanRolePerson = WithNull<
  Functions['clan_roles']['Returns'][number],
  'avatar_path' | 'role_note'
>;
export type ClanMember = WithNull<Functions['clan_roster']['Returns'][number], 'avatar_path'>;
export type ClanRequest = WithNull<
  Functions['clan_requests']['Returns'][number],
  'avatar_path' | 'message'
>;
export type ClanLeaderboardRow = WithNull<
  Functions['clan_leaderboard']['Returns'][number],
  'avatar_path'
>;
export type ClanClash = WithNull<
  Functions['clan_clashes']['Returns'][number],
  | 'season_label'
  | 'opponent_name'
  | 'next_event_id'
  | 'next_position'
  | 'next_title'
  | 'next_sport_id'
  | 'next_starts_at'
>;

export type ClashView = WithNull<
  Functions['clash_view']['Returns'][number],
  | 'season_label'
  | 'my_side'
  | 'my_captain_side'
  | 'leader'
  | 'next_event_id'
  | 'next_position'
  | 'first_starts_at'
  | 'last_starts_at'
  | 'my_backing'
>;
export type ClashEvent = WithNull<
  Functions['clash_events_list']['Returns'][number],
  | 'place_id'
  | 'place_name'
  | 'place_area'
  | 'squad_size'
  | 'a_value'
  | 'b_value'
  | 'winner_side'
  | 'result_source'
  | 'pending_submission_id'
  | 'pending_side'
  | 'pending_a_value'
  | 'pending_b_value'
>;
export type ClashMyPart = WithNull<
  Functions['clash_my_part']['Returns'][number],
  'place_name' | 'place_area' | 'squad_size'
>;
export type ClashStanding = Functions['clash_season_standings']['Returns'][number];

/** Crew Momentum's state (crew_home.momentum). Never a loss: a missed week is a comeback. */
export type MomentumState = 'on_rhythm' | 'comeback' | 'starting';

/** The design system's situation for a Clash stage (same as the server's `clash_view.situation`). */
export type CommunitySituation = 'calm' | 'forming' | 'confirmed' | 'live' | 'after';
export function situationForClashStage(stage: ClashStage): CommunitySituation {
  switch (stage) {
    case 'live':
      return 'live';
    case 'complete':
      return 'after';
    case 'upcoming':
      return 'confirmed';
    case 'proposed':
      return 'forming';
    default:
      return 'calm';
  }
}

/**
 * The streak in words for CrewMomentum ("6 WEEK STREAK"). Never shames: no streak reads as a
 * comeback or a start, not as zero.
 */
export function momentumHeadline(state: MomentumState, streakWeeks: number): string {
  if (state === 'on_rhythm' && streakWeeks > 0) return `${streakWeeks} WEEK STREAK`;
  if (state === 'comeback') return 'COMEBACK WEEK';
  return 'FIRST WEEK';
}

/** Mission progress as 0–1 for Progress / the bar segments. */
export function missionFraction(progress: number, target: number): number {
  if (!(target > 0) || !(progress > 0)) return 0;
  return Math.min(1, progress / target);
}

/** "1,240 km", "46 runs", "12.5 hours": mission numbers in words with grouping. */
export function formatMissionAmount(value: number, metric: MissionMetric): string {
  const rounded = metric === 'runs' ? Math.round(value) : Math.round(value * 10) / 10;
  const text = rounded.toLocaleString('en-US', { maximumFractionDigits: 1 });
  if (metric === 'distance_km') return `${text} km`;
  if (metric === 'runs') return `${text} run${rounded === 1 ? '' : 's'}`;
  return `${text} hour${rounded === 1 ? '' : 's'}`;
}

/** A Clash score from your side ("2-1"): your wins first when you're in it, else side a's. */
export function clashScore(
  view: { a_wins: number; b_wins: number; my_side: 'a' | 'b' | null },
): { mine: number; theirs: number; text: string } {
  const mine = view.my_side === 'b' ? view.b_wins : view.a_wins;
  const theirs = view.my_side === 'b' ? view.a_wins : view.b_wins;
  return { mine, theirs, text: `${mine}-${theirs}` };
}

/**
 * A Clash event's result value in words: seconds as m:ss for time, km for distance, counts as is.
 * "21–17" is built from two of these.
 */
export function formatClashValue(value: number | null | undefined, scoring: ClashScoring): string | null {
  if (value === null || value === undefined) return null;
  if (scoring === 'time') {
    const s = Math.round(value);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  }
  if (scoring === 'distance') return `${(Math.round(value * 10) / 10).toFixed(1)} km`;
  return String(Math.round(value));
}

/** The clan names a Clash poster shows first and second: yours first when you're in it. */
export function clashSides<T>(view: { my_side: 'a' | 'b' | null }, a: T, b: T): [T, T] {
  return view.my_side === 'b' ? [b, a] : [a, b];
}

// Realtime ---------------------------------------------------------------------------------------

/**
 * Crew Home: members (the count), the crew's plans (next, Rituals' weeks),
 * its Rituals, and new chat messages (the "4 NEW" count). Refetch the reads on any change.
 */
export function crewHomeSubscription(crewId: string): RealtimeSubscription {
  const filter = `crew_id=eq.${crewId}`;
  return {
    channel: `crew-home:${crewId}`,
    changes: [
      { event: '*', schema: 'public', table: 'crew_members', filter },
      { event: '*', schema: 'public', table: 'plans', filter },
      { event: '*', schema: 'public', table: 'rituals', filter },
      { event: 'INSERT', schema: 'public', table: 'messages', filter },
    ],
  };
}

/** Clan page: the clan row, members and roles, club runs, the mission, requests (admitters). */
export function clanSubscription(clanId: string): RealtimeSubscription {
  const filter = `clan_id=eq.${clanId}`;
  return {
    channel: `clan:${clanId}`,
    changes: [
      { event: 'UPDATE', schema: 'public', table: 'clans', filter: `id=eq.${clanId}` },
      { event: '*', schema: 'public', table: 'clan_members', filter },
      { event: '*', schema: 'public', table: 'clan_runs', filter },
      { event: '*', schema: 'public', table: 'clan_missions', filter },
      { event: '*', schema: 'public', table: 'clan_join_requests', filter },
    ],
  };
}

/** Clash page: the Clash row (backing counts), events, squads, results and pending submissions. */
export function clashSubscription(clashId: string): RealtimeSubscription {
  const filter = `clash_id=eq.${clashId}`;
  return {
    channel: `clash:${clashId}`,
    changes: [
      { event: 'UPDATE', schema: 'public', table: 'clashes', filter: `id=eq.${clashId}` },
      { event: '*', schema: 'public', table: 'clash_squad_members', filter },
      { event: 'INSERT', schema: 'public', table: 'clash_event_results', filter },
      { event: '*', schema: 'public', table: 'clash_result_submissions', filter },
    ],
  };
}
