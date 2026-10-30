/**
 * Step 7 (Places & Passport, PRD M8 · §9.17, §9.1) client contract helpers: Passport detail (totals,
 * places, sports, months, firsts and milestones, personal bests), the stamps list, Challenge stamps and
 * personal bests, goals (one active at a time), achievements (derived from history) and reputation.
 * The full contract is docs/PASSPORT_CONTRACT.md; table and enum shapes are generated into
 * ./database.types.ts. The jsonb reads (`passport_view`, `passport_goal`, `passport_reputation`, the
 * goal mutations) are typed here.
 *
 * No points, no redeemable rewards, no money, no odds: achievements are history put into words.
 *
 * Pure TypeScript with no runtime dependencies.
 */
import type { Database } from './database.types';
import type { RealtimeSubscription } from './slice01';
import type { ChallengeScoring, WithNull } from './competition';

type Functions = Database['public']['Functions'];
type Enums = Database['public']['Enums'];
type RpcName = keyof Functions;
type Row<F extends RpcName> = Functions[F]['Returns'] extends (infer R)[] ? R : never;

/** Every Step 7 Passport RPC the client may call. */
export const passportRpcs = [
  'passport_view',
  'passport_stamps',
  'passport_entry',
  'passport_entry_for',
  'passport_achievements',
  'passport_reputation',
  'passport_goal',
  'challenge_passport_for_me',
  'set_goal',
  'clear_goal',
  'set_goals_visibility',
] as const satisfies readonly RpcName[];

/** Passport RPCs that take `p_idempotency_key` (one uuid per intention, reused on retry). */
export const passportIdempotentRpcs = ['set_goal'] as const satisfies readonly RpcName[];

/** Stable error codes added by the Passport backend (also part of `ojoroErrorCodes`). */
export const passportErrorCodes = ['goal_invalid'] as const;

/** Someone else's show-up record is shown only when it rests on at least this many games. */
export const SHOW_UP_MIN_GAMES = 5;
/** passport_stamps page size (default) and the most it returns. */
export const PASSPORT_STAMPS_PAGE = 30;
export const PASSPORT_STAMPS_MAX = 100;
/** Goal target limits (server-checked; `goal_invalid` with detail `target_value`). */
export const GOAL_LIMITS = {
  timeSeconds: { min: 60, max: 86_400 },
  distance: { min: 0.1, max: 1000 },
  sessions: { min: 1, max: 500 },
  places: { min: 1, max: 100 },
  /** target_date at most this many years ahead. */
  years: 3,
} as const;

// Enums --------------------------------------------------------------------------------------------------

export type PassportEntryKind = Enums['passport_entry_kind'];
export type GoalKind = Enums['goal_kind'];
export type Visibility = Enums['visibility'];
export type ReputationKind = Enums['reputation_kind'];
export type ChallengeOutcome = 'won' | 'lost' | 'draw';
/** What a stamp marks, by priority (at most one per stamp). */
export type PassportMilestoneKind =
  | 'first_stamp'
  | 'first_in_discipline'
  | 'first_in_sport'
  | 'personal_best'
  | 'first_challenge'
  | 'first_at_place'
  | 'place_games'
  | 'stamps';
export type AchievementLadder =
  | 'sessions'
  | 'regular'
  | 'challenges'
  | 'people'
  | 'places'
  | 'sports'
  | 'personal_bests'
  | 'goals'
  | 'hosted';
export type AchievementFamily = 'participation' | 'exploration' | 'improvement' | 'contribution';

// passport_view -------------------------------------------------------------------------------------------

export type PassportTotals = {
  stamps: number;
  games: number;
  challenges: number;
  minutes: number;
  /** One decimal. Same number as profile_view.ojoro_hours. */
  ojoro_hours: number;
  places: number;
  sports: number;
  /** Checked in to the same game (same rule as profile_view.people_moved_with). */
  people_moved_with: number;
  personal_bests: number;
  first_at: string | null;
  last_at: string | null;
};

export type PassportPlaceGroup = {
  place_id: string;
  name: string;
  area: string;
  city: string;
  time_zone: string;
  stamps: number;
  games: number;
  first_at: string;
  last_at: string;
};

export type PassportSportGroup = {
  sport_id: string;
  name: string;
  stamps: number;
  games: number;
  challenges: number;
  minutes: number;
  first_at: string;
  last_at: string;
};

/** A month in the owner's time zone ('YYYY-MM'). Newest first. */
export type PassportMonthGroup = { month: string; stamps: number; minutes: number; places: number };

export type PassportMilestone = {
  entry_id: string;
  /** The game (Recap) or Challenge (Result) it came from; null unless the viewer can see it. */
  activity_id: string | null;
  challenge_event_id: string | null;
  milestone: PassportMilestoneKind;
  /** For `place_games` (games at the place) and `stamps` (stamps in all). */
  count: number | null;
  kind: PassportEntryKind;
  occurred_at: string;
  sport_id: string;
  sport_name: string;
  place_id: string | null;
  place_name: string | null;
  place_time_zone: string | null;
  /** Challenge stamps: the discipline ("5K"), the person's value, scoring, unit and outcome. */
  title: string | null;
  value: number | null;
  scoring: ChallengeScoring | null;
  unit: string | null;
  outcome: ChallengeOutcome | null;
};

/** The current best in one discipline. `value` is seconds for time, the unit for distance. */
export type PassportPersonalBest = {
  personal_best_id: string;
  sport_id: string;
  sport_name: string;
  discipline: string;
  scoring: 'time' | 'distance';
  /** The course unit ("km"); for time the value is still seconds. */
  unit: string | null;
  value: number;
  previous_value: number | null;
  first_value: number;
  improvements: number;
  set_at: string;
  place_name: string | null;
  /** Null when the viewer can't see that Challenge. */
  event_id: string | null;
};

/** `passport_view(p_user_id)`: null when there's no such person or a block either way. */
export type PassportView = {
  user_id: string;
  display_name: string | null;
  handle: string | null;
  avatar_path: string | null;
  is_me: boolean;
  /** The owner's history setting includes the viewer. False: show the privacy state, nothing else. */
  visible: boolean;
  /** The owner's goals setting includes the viewer (passport_goal may still be null: no goal). */
  goals_visible: boolean;
  time_zone: string;
  /** Yours only. */
  history_visibility: Visibility | null;
  goals_visibility: Visibility | null;
  totals: PassportTotals | null;
  places: PassportPlaceGroup[];
  sports: PassportSportGroup[];
  months: PassportMonthGroup[];
  /** The latest 24 firsts and milestones, newest first. */
  milestones: PassportMilestone[];
  personal_bests: PassportPersonalBest[];
};

// passport_stamps -----------------------------------------------------------------------------------------

export type PassportStamp = WithNull<
  Row<'passport_stamps'>,
  | 'place_id'
  | 'place_name'
  | 'place_area'
  | 'place_time_zone'
  | 'activity_id'
  | 'challenge_event_id'
  | 'title'
  | 'scoring'
  | 'unit'
  | 'value'
  | 'outcome'
  | 'place_number'
  | 'place_game_number'
  | 'previous_best'
  | 'milestone'
  | 'milestone_count'
>;

/** `passport_entry(p_entry_id)` / `passport_entry_for(...)`: one stamp, with its owner. */
export type PassportEntryDetail = WithNull<
  Row<'passport_entry'>,
  | 'place_id'
  | 'place_name'
  | 'place_area'
  | 'place_time_zone'
  | 'activity_id'
  | 'challenge_event_id'
  | 'title'
  | 'scoring'
  | 'unit'
  | 'value'
  | 'outcome'
  | 'place_number'
  | 'place_game_number'
  | 'previous_best'
  | 'milestone'
  | 'milestone_count'
>;

export type PassportStampsFilter =
  | { by: 'all' }
  | { by: 'place'; placeId: string }
  | { by: 'sport'; sportId: string }
  | { by: 'month'; month: string }
  | { by: 'milestones' };

/** Arguments for `passport_stamps` from a filter (and the previous page's last `occurred_at`). */
export function passportStampsArgs(
  userId: string,
  filter: PassportStampsFilter = { by: 'all' },
  before?: string | null,
  limit = PASSPORT_STAMPS_PAGE,
) {
  return {
    p_user_id: userId,
    ...(filter.by === 'place' ? { p_place_id: filter.placeId } : {}),
    ...(filter.by === 'sport' ? { p_sport_id: filter.sportId } : {}),
    ...(filter.by === 'month' ? { p_month: filter.month } : {}),
    ...(filter.by === 'milestones' ? { p_milestones_only: true } : {}),
    ...(before ? { p_before: before } : {}),
    p_limit: limit,
  };
}

// Achievements --------------------------------------------------------------------------------------------

export type PassportAchievement = Omit<
  WithNull<Row<'passport_achievements'>, 'achieved_at' | 'context'>,
  'ladder' | 'family'
> & { ladder: AchievementLadder; family: AchievementFamily };

// Reputation ----------------------------------------------------------------------------------------------

/** `passport_reputation(p_user_id)`: null across a block. */
export type PassportReputation = {
  threshold: number;
  /** Kinds with at least `threshold` confirmations, most first. */
  signals: { kind: ReputationKind; confirmations: number }[];
  /** Yours only: kinds people have started to confirm (fewer than the threshold), no count. */
  building: ReputationKind[];
  /** Yours always; someone else's when their history is visible and it rests on ≥ 5 games. */
  show_up: { showed_up: number; committed: number } | null;
  hosted: number;
  history_visible: boolean;
};

// Goals ---------------------------------------------------------------------------------------------------

export type GoalNextStep = {
  kind: 'plan' | 'activity';
  plan_id: string;
  activity_id: string | null;
  sport_id: string;
  sport_name: string;
  title: string | null;
  starts_at: string;
  status: string;
  member_count: number;
  capacity: number;
  spots_left: number;
  place_id: string | null;
  place_name: string | null;
  place_area: string | null;
  place_time_zone: string | null;
  /** 'join' (I'M DOWN) | 'waitlist' | 'watch'. */
  action: string;
  reason: string;
};

export type GoalNextTest = {
  event_id: string;
  title: string;
  starts_at: string;
  time_zone: string;
  place_name: string | null;
  opponent_name: string | null;
};

/** `passport_goal(p_user_id)` and the result of `set_goal`: null when none or not visible. */
export type GoalView = {
  goal_id: string;
  user_id: string;
  is_me: boolean;
  kind: GoalKind;
  sport_id: string | null;
  sport_name: string | null;
  discipline: string | null;
  scoring: 'time' | 'distance' | null;
  unit: string | null;
  /** Seconds (time), the unit (distance), or a count (sessions, places). */
  target_value: number;
  /** 'YYYY-MM-DD', the last day. */
  target_date: string | null;
  created_at: string;
  updated_at: string;
  achieved_at: string | null;
  /** personal_best: best so far (null: never recorded). sessions / places: count since the goal was set. */
  current_value: number | null;
  best_at: string | null;
  achieved: boolean;
  /** 0–1, for a progress bar (with the words; never colour-only). */
  fraction: number;
  /** Yours only. */
  next_step: GoalNextStep | null;
  next_test: GoalNextTest | null;
};

export type ClearGoalResult = { cleared: boolean; goal_id: string | null };

/** The Result screen's YOU row: your stamp for this Challenge, PB and how far from your goal. */
export type ChallengePassportForMe = WithNull<
  Row<'challenge_passport_for_me'>,
  | 'place_name'
  | 'place_time_zone'
  | 'unit'
  | 'previous_best'
  | 'best_value'
  | 'goal_id'
  | 'goal_target'
  | 'goal_target_date'
  | 'goal_gap'
>;

// Words ---------------------------------------------------------------------------------------------------

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Seconds as a race time: 1385 → "23:05", 3725 → "1:02:05". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** A Challenge / personal best value in words: time "23:05", distance "12.4 km", otherwise the number. */
export function formatResultValue(
  scoring: ChallengeScoring | null,
  value: number | null,
  unit?: string | null,
): string {
  if (value == null) return '';
  if (scoring === 'time') return formatDuration(value);
  const n = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
  return scoring === 'distance' ? `${n} ${unit ?? 'km'}` : n;
}

/** A gap in words: time "49 s" / "1:12"; distance "0.4 km". Always positive. */
export function formatGap(
  scoring: ChallengeScoring | null,
  gap: number,
  unit?: string | null,
): string {
  const g = Math.abs(gap);
  if (scoring === 'time') return g < 60 ? `${Math.round(g)} s` : formatDuration(g);
  return formatResultValue(scoring, g, unit);
}

/** 'YYYY-MM' → "OCTOBER 2026" (display face). */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const name = MONTHS[(m ?? 1) - 1] ?? '';
  return `${name} ${y}`.toUpperCase();
}

/**
 * The headline of a stamp in the display face: "FIRST GAME", "FIRST BOXING", "FIRST 10K", "NEW 5K PB",
 * "FIRST CHALLENGE", "FIRST TIME HERE", "20 GAMES", "50 STAMPS". Plain stamps: "5K · WON" for a
 * Challenge, "GAME 12" for a game.
 */
export function stampHeadline(stamp: {
  milestone: PassportMilestoneKind | string | null;
  milestone_count?: number | null;
  count?: number | null;
  kind: PassportEntryKind;
  sport_name: string;
  title: string | null;
  outcome: ChallengeOutcome | string | null;
  sport_number?: number | null;
}): string {
  const n = stamp.milestone_count ?? stamp.count ?? null;
  const title = (stamp.title ?? '').toUpperCase();
  switch (stamp.milestone) {
    case 'first_stamp':
      return stamp.kind === 'challenge' ? 'FIRST CHALLENGE' : 'FIRST GAME';
    case 'first_in_sport':
      return `FIRST ${stamp.sport_name.toUpperCase()}`;
    case 'first_in_discipline':
      return `FIRST ${title}`;
    case 'personal_best':
      return `NEW ${title} PB`;
    case 'first_challenge':
      return 'FIRST CHALLENGE';
    case 'first_at_place':
      return 'FIRST TIME HERE';
    case 'place_games':
      return `${n ?? ''} GAMES`.trim();
    case 'stamps':
      return `${n ?? ''} STAMPS`.trim();
    default:
      if (stamp.kind === 'challenge') {
        const outcome =
          stamp.outcome === 'won' ? 'WON' : stamp.outcome === 'lost' ? 'LOST' : 'DRAW';
        return `${title} · ${outcome}`;
      }
      return stamp.sport_number ? `GAME ${stamp.sport_number}` : stamp.sport_name.toUpperCase();
  }
}

const LADDER_WORDS: Record<AchievementLadder, (n: number) => string> = {
  sessions: (n) => (n === 1 ? 'FIRST STAMP' : `${n} STAMPS`),
  regular: (n) => `${n} GAMES AT ONE PLACE`,
  challenges: (n) => (n === 1 ? 'FIRST CHALLENGE' : `${n} CHALLENGES`),
  people: (n) => `MOVED WITH ${n} PEOPLE`,
  places: (n) => `${n} PLACES`,
  sports: (n) => `${n} SPORTS`,
  personal_bests: (n) => (n === 1 ? 'FIRST PB' : `${n} PBS`),
  goals: (n) => (n === 1 ? 'FIRST GOAL REACHED' : `${n} GOALS REACHED`),
  hosted: (n) => (n === 1 ? 'FIRST GAME HOSTED' : `${n} GAMES HOSTED`),
};

/** An achievement's title in the display face ("10 GAMES AT ONE PLACE", "FIRST PB"). */
export function achievementTitle(ladder: AchievementLadder, threshold: number): string {
  return LADDER_WORDS[ladder](threshold);
}

/** The line under a locked (next) achievement: "6 of 10". Counts, not adjectives. */
export function achievementProgress(
  a: Pick<PassportAchievement, 'achieved' | 'current' | 'threshold'>,
) {
  return a.achieved ? null : `${Math.min(a.current, a.threshold)} of ${a.threshold}`;
}

const REPUTATION_WORDS: Record<ReputationKind, string> = {
  shows_up: 'SHOWS UP',
  respectful: 'RESPECTFUL',
  welcomes_beginners: 'WELCOMES BEGINNERS',
  great_host: 'GREAT HOST',
};

/** A reputation chip: "SHOWS UP · 31" (label face, tabular count). */
export function reputationLabel(kind: ReputationKind, confirmations?: number): string {
  return confirmations == null
    ? REPUTATION_WORDS[kind]
    : `${REPUTATION_WORDS[kind]} · ${confirmations}`;
}

/** "Showed up to 46 of 48 games." */
export function showUpSentence(record: { showed_up: number; committed: number }): string {
  const noun = record.committed === 1 ? 'game' : 'games';
  return `Showed up to ${record.showed_up} of ${record.committed} ${noun}.`;
}

/** Last day of a target date in words: "BY DECEMBER", or "BY 14 MARCH 2027" when not the month's end. */
export function goalDateLabel(targetDate: string, today = new Date()): string {
  const [y, m, d] = targetDate.split('-').map(Number);
  const monthName = (MONTHS[(m ?? 1) - 1] ?? '').toUpperCase();
  const lastDay = new Date(Date.UTC(y ?? 1970, m ?? 1, 0)).getUTCDate();
  const sameYear = (y ?? 0) === today.getUTCFullYear();
  if (d === lastDay) return sameYear ? `BY ${monthName}` : `BY ${monthName} ${y}`;
  return `BY ${d} ${monthName}${sameYear ? '' : ` ${y}`}`;
}

/**
 * The goal headline in the display face, with the full stop: "SUB-22 5K BY DECEMBER.",
 * "10K OVER 12 KM." (distance), "10 SESSIONS BY DECEMBER.", "3 NEW PLACES.", "8 RUNNING SESSIONS."
 */
export function goalHeadline(
  goal: Pick<
    GoalView,
    'kind' | 'discipline' | 'scoring' | 'target_value' | 'target_date' | 'sport_name' | 'unit'
  >,
  today = new Date(),
): string {
  const by = goal.target_date ? ` ${goalDateLabel(goal.target_date, today)}` : '';
  const n = goal.target_value;
  let head: string;
  if (goal.kind === 'personal_best') {
    const discipline = (goal.discipline ?? '').toUpperCase();
    if (goal.scoring === 'time') {
      const t = n % 60 === 0 ? String(n / 60) : formatDuration(n);
      head = `SUB-${t} ${discipline}`;
    } else {
      head = `${discipline} OVER ${formatResultValue('distance', n, goal.unit).toUpperCase()}`;
    }
  } else if (goal.kind === 'sessions') {
    const sport = goal.sport_name ? `${goal.sport_name.toUpperCase()} ` : '';
    head = `${n} ${sport}${n === 1 ? 'SESSION' : 'SESSIONS'}`;
  } else {
    head = `${n} NEW ${n === 1 ? 'PLACE' : 'PLACES'}`;
  }
  return `${head}${by}.`;
}

/** The line under the goal: "Best so far: 23:05.", "4 of 10 so far.", "Reached." */
export function goalProgressLine(
  goal: Pick<GoalView, 'kind' | 'scoring' | 'current_value' | 'target_value' | 'achieved' | 'unit'>,
): string {
  if (goal.achieved) return 'Reached.';
  if (goal.kind === 'personal_best') {
    return goal.current_value == null
      ? 'No result yet. A Challenge in this discipline sets your first.'
      : `Best so far: ${formatResultValue(goal.scoring, goal.current_value, goal.unit)}.`;
  }
  return `${goal.current_value ?? 0} of ${goal.target_value} so far.`;
}

/**
 * The Result screen's goal clause: "49 s off your goal." / "Under your goal by 12 s." / null when no
 * goal in this discipline.
 */
export function goalGapSentence(
  row: Pick<ChallengePassportForMe, 'goal_gap' | 'scoring' | 'unit'>,
) {
  if (row.goal_gap == null) return null;
  if (row.goal_gap <= 0) {
    return row.goal_gap === 0
      ? 'Right on your goal.'
      : `Past your goal by ${formatGap(row.scoring, row.goal_gap, row.unit)}.`;
  }
  return `${formatGap(row.scoring, row.goal_gap, row.unit)} off your goal.`;
}

// Realtime ------------------------------------------------------------------------------------------------

/**
 * Passport detail / You: a new stamp, personal best or goal change for one person (RLS applies:
 * someone else's only arrive when their history / goals are visible to you). A refetch hint.
 */
export function passportSubscription(userId: string): RealtimeSubscription {
  const filter = `user_id=eq.${userId}`;
  return {
    channel: `passport:${userId}`,
    changes: [
      { event: 'INSERT', schema: 'public', table: 'passport_entries', filter },
      { event: 'INSERT', schema: 'public', table: 'personal_bests', filter },
      { event: '*', schema: 'public', table: 'goals', filter },
    ],
  };
}
