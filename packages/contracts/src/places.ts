/**
 * Step 7 (Places and Ojoro Pulse, PRD §9.16, §11.2) client contract helpers: the Pulse map markers,
 * the selected-place sheet, and the Place page (facts, tonight here, regular groups, hosts here, busy
 * times, CREATE ACTIVITY HERE prefill). The full contract is docs/PLACES_CONTRACT.md; the database
 * shapes are generated into ./database.types.ts.
 *
 * Pure TypeScript with no runtime dependencies.
 */
import type { Database } from './database.types';
import type { RealtimeSubscription } from './slice01';
import type { WithNull } from './competition';

type Functions = Database['public']['Functions'];
type Enums = Database['public']['Enums'];
type RpcName = keyof Functions;
type Row<F extends RpcName> = Functions[F]['Returns'] extends (infer R)[] ? R : never;

/** Every Places / Pulse RPC the client may call. All are reads; none takes an idempotency key. */
export const placesRpcs = [
  'pulse',
  'pulse_place',
  'place_view',
  'place_tonight',
  'place_groups',
  'place_hosts',
  'place_busy_times',
] as const satisfies readonly RpcName[];

/**
 * Reads that record an analytics event (`pulse_viewed`, `place_viewed`), so they are VOLATILE: call
 * them with the default `supabase.rpc(name, args)` (POST), never with `{ get: true }`.
 */
export const placesLoggedReadRpcs = ['pulse', 'place_view'] as const satisfies readonly RpcName[];

/**
 * Error codes these reads raise. All already exist (Slice 01 / Step 3), so nothing new is added to
 * `ojoroErrorCodes`: `place_unknown` (no such place), `sport_unknown`, `radius_invalid` (1–50 km),
 * `invalid_argument` (detail `when`), `not_authenticated`.
 */
export const placesErrorCodes = [
  'place_unknown',
  'sport_unknown',
  'radius_invalid',
  'invalid_argument',
] as const;

/** Time filters for Pulse and TONIGHT HERE. `tonight` (the default) runs until 4 AM local. */
export const PULSE_WHEN = ['now', 'tonight', 'today', 'tomorrow', 'weekend', 'week'] as const;
export type PulseWhen = (typeof PULSE_WHEN)[number];

/** Words for a window, as the server uses them in `summary` / `headline`. */
export const PULSE_WHEN_WORDS: Record<PulseWhen, string> = {
  now: 'in the next hour',
  tonight: 'tonight',
  today: 'today',
  tomorrow: 'tomorrow',
  weekend: 'this weekend',
  week: 'this week',
};

/** Header label next to the radius ("Tonight · 3 km"). */
export const PULSE_WHEN_LABEL: Record<PulseWhen, string> = {
  now: 'Next hour',
  tonight: 'Tonight',
  today: 'Today',
  tomorrow: 'Tomorrow',
  weekend: 'This weekend',
  week: 'This week',
};

/** Latent demand on Pulse shows only from this many people (same k as LATENT_DEMAND_K). */
export const PULSE_DEMAND_K = 3;
/** Busy times show only from this many finished sessions in the last 12 weeks. */
export const PLACE_BUSY_MIN_GAMES = 6;
/** HOSTS HERE lists people who hosted at least this many finished games here (or run a series here). */
export const PLACE_HOST_MIN_GAMES = 5;
/** TRUSTED HOST: finished games hosted, and "great host" from this many different people. */
export const TRUSTED_HOST_GAMES = 20;
export const TRUSTED_HOST_GREAT_HOST_FROM = 5;
/** Pulse has no live clock of its own: refetch this often while the screen is visible. */
export const PULSE_REFETCH_MS = 60_000;

export type PlaceKind = Enums['place_kind'];
export type PlaceVerification = Enums['place_verification'];
export type DayPart = Enums['day_part'];

/** One map marker. `kind`: `place` (a non-sensitive place with something on), `area` (an area's
 * aggregate, sensitive places included only from k activities) or `demand` (k+ people want a sport
 * near an area). Columns that don't apply to a kind are null. */
export type PulseMarker = WithNull<
  Row<'pulse'>,
  | 'place_id'
  | 'place_name'
  | 'distance_km'
  | 'activity_count'
  | 'live_count'
  | 'forming_count'
  | 'forming_plan_id'
  | 'forming_sport_name'
  | 'forming_member_count'
  | 'forming_capacity'
  | 'forming_starts_at'
  | 'live_activity_id'
  | 'live_title'
  | 'sport_id'
  | 'sport_name'
  | 'people_count'
>;
export type PulseMarkerKind = 'place' | 'area' | 'demand';

/** The selected-place sheet. Counts are null when `suppressed` (a sensitive place). */
export type PulsePlace = WithNull<
  Row<'pulse_place'>,
  | 'main_sport_id'
  | 'main_sport_name'
  | 'surface'
  | 'floodlit_until'
  | 'distance_km'
  | 'activity_count'
  | 'live_count'
  | 'forming_count'
  | 'forming_plan_id'
  | 'forming_sport_name'
  | 'forming_member_count'
  | 'forming_capacity'
  | 'forming_starts_at'
>;

/** The Place page header, facts, busy summary and CREATE ACTIVITY HERE prefill. */
export type PlaceView = WithNull<
  Row<'place_view'>,
  | 'description'
  | 'main_sport_id'
  | 'main_sport_name'
  | 'surface'
  | 'floodlit_until'
  | 'verified_at'
  | 'photo_path'
  | 'distance_km'
  | 'busy_part'
  | 'busy_levels'
  | 'busiest_day'
  | 'today_rank'
  | 'busy_summary'
  | 'prefill_sport_id'
  | 'prefill_duration_minutes'
  | 'prefill_capacity'
>;

/** TONIGHT HERE rows. `kind`: `plan` (forming), `activity` (GAME ON or live), `club_run`. */
export type PlaceTonightItem = WithNull<
  Row<'place_tonight'>,
  'plan_id' | 'activity_id' | 'clan_run_id' | 'clan_id' | 'title' | 'level_label' | 'meeting_point'
>;
export type PlaceTonightKind = 'plan' | 'activity' | 'club_run';

/** RITUALS HERE rows. `kind`: `crew_ritual` | `clan_ritual` | `host_series`. */
export type PlaceGroup = WithNull<Row<'place_groups'>, 'distance_km'>;
export type PlaceGroupKind = 'crew_ritual' | 'clan_ritual' | 'host_series';
/** Who can come: crew (members only), open, request (ask to join), invite (clan members only). */
export type PlaceGroupAccess = 'crew' | 'open' | 'request' | 'invite';

/** HOSTS HERE rows, most games first; `is_top` marks the top host. */
export type PlaceHost = WithNull<
  Row<'place_hosts'>,
  'handle' | 'avatar_path' | 'display_name' | 'program_id' | 'program_name'
>;

/** WHEN IT'S BUSY by weekday (1 = Monday) and local hour; level 0–100. Missing hours are 0. */
export type PlaceBusyTime = Row<'place_busy_times'>;

const DAY_SHORT = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

/** Section label part: "WHEN IT'S BUSY · EVENINGS". */
export function busyPartLabel(part: DayPart | null): string | null {
  if (part == null) return null;
  return part === 'morning' ? 'MORNINGS' : part === 'midday' ? 'AFTERNOONS' : 'EVENINGS';
}

export interface BusyBar {
  day: number;
  label: (typeof DAY_SHORT)[number];
  level: number;
  isToday: boolean;
  isBusiest: boolean;
}

/** Seven bars (Mon..Sun) from `place_view.busy_levels`. Empty without history. The design fills
 * today's bar (oxblood); the busiest gets no colour of its own (status is never colour-only: the
 * summary sentence says it). */
export function busyBars(
  view: Pick<PlaceView, 'busy_levels' | 'today_day' | 'busiest_day'>,
): BusyBar[] {
  const levels = view.busy_levels;
  if (levels == null || levels.length !== 7) return [];
  return levels.map((level, i) => ({
    day: i + 1,
    label: DAY_SHORT[i] as (typeof DAY_SHORT)[number],
    level: Math.max(0, Math.min(100, level)),
    isToday: view.today_day === i + 1,
    isBusiest: view.busiest_day === i + 1,
  }));
}

/** The tag on a TONIGHT HERE row: "6 / 8" while forming, GAME ON, LIVE. */
export function tonightTag(item: Pick<PlaceTonightItem, 'status' | 'member_count' | 'capacity'>): string {
  if (item.status === 'live') return 'LIVE';
  if (item.status === 'game_on') return 'GAME ON';
  return `${item.member_count} / ${item.capacity}`;
}

/** The tag on a RITUALS HERE row. */
export function groupTag(group: Pick<PlaceGroup, 'kind' | 'access'>): string {
  if (group.kind === 'crew_ritual') return 'CREW';
  switch (group.access) {
    case 'open':
      return 'OPEN';
    case 'request':
      return 'ASK TO JOIN';
    case 'invite':
      return 'MEMBERS';
    default:
      return 'CREW';
  }
}

/** "Every week, 7:30 · 6 weeks running". */
export function groupCadence(group: Pick<PlaceGroup, 'cadence' | 'weeks_running' | 'kind'>): string {
  const n = group.weeks_running;
  if (n <= 1) return group.cadence;
  const unit = group.kind === 'host_series' ? 'sessions so far' : 'weeks running';
  return `${group.cadence} · ${n} ${unit}`;
}

/** "40 games hosted here". */
export function hostedHereWords(n: number): string {
  return `${n} ${n === 1 ? 'game' : 'games'} hosted here`;
}

/** Arguments for `create_plan` from CREATE ACTIVITY HERE (the user still confirms on Create). */
export function placeCreatePrefill(
  view: Pick<
    PlaceView,
    | 'place_id'
    | 'prefill_sport_id'
    | 'prefill_starts_at'
    | 'prefill_capacity'
    | 'prefill_duration_minutes'
  >,
): {
  p_place_id: string;
  p_sport_id: string | null;
  p_starts_at: string;
  p_capacity: number | null;
  p_duration_minutes: number | null;
} {
  return {
    p_place_id: view.place_id,
    p_sport_id: view.prefill_sport_id,
    p_starts_at: view.prefill_starts_at,
    p_capacity: view.prefill_capacity,
    p_duration_minutes: view.prefill_duration_minutes,
  };
}

/**
 * The map's full text alternative (SCREENS.md: "Map needs a full text alternative"). Places first,
 * busiest first, then demand; areas only when no place of that area is listed. Built from each
 * marker's `summary`.
 */
export function pulseTextAlternative(
  markers: readonly Pick<PulseMarker, 'kind' | 'area' | 'city' | 'summary'>[],
  context: { label?: string } = {},
): string {
  const places = markers.filter((m) => m.kind === 'place');
  const placeAreas = new Set(places.map((m) => `${m.city}:${m.area}`));
  const areas = markers.filter((m) => m.kind === 'area' && !placeAreas.has(`${m.city}:${m.area}`));
  const demand = markers.filter((m) => m.kind === 'demand');
  const parts = [...places, ...areas, ...demand].map((m) => m.summary);
  const head = context.label ? `Map of ${context.label}. ` : 'Map. ';
  if (parts.length === 0) return `${head}Nothing on here for this filter. Areas, not people.`;
  return `${head}${parts.join(' ')} Areas, not people.`;
}

/** Realtime for Pulse: every place and Down For change in one city. Refetch hint only. */
export function pulseSubscription(city: string): RealtimeSubscription {
  return {
    channel: `pulse:${city}`,
    changes: [{ event: '*', schema: 'public', table: 'pulse_ticks', filter: `city=eq.${city}` }],
  };
}

/** Realtime for Place: one place's tick. Refetch `place_view` counts and `place_tonight`. */
export function placeSubscription(placeId: string): RealtimeSubscription {
  return {
    channel: `place:${placeId}`,
    changes: [
      { event: '*', schema: 'public', table: 'pulse_ticks', filter: `place_id=eq.${placeId}` },
    ],
  };
}
