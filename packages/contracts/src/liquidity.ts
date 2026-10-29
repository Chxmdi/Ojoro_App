/**
 * Step 3 (Liquidity, PRD M4) client contract helpers. The full contract is
 * docs/LIQUIDITY_CONTRACT.md; the database shapes are generated into ./database.types.ts.
 *
 * Pure TypeScript with no runtime dependencies.
 */
import type { Database } from './database.types';

type Functions = Database['public']['Functions'];
type RpcName = keyof Functions;

/**
 * Every Step 3 RPC the client may call. `satisfies` makes `pnpm typecheck` fail if a function is
 * renamed or dropped in the database and the generated types are refreshed.
 */
export const liquidityRpcs = [
  // Areas (no location permission needed)
  'areas_list',
  'set_area',
  // Ojoro Now and FirstHome
  'ojoro_now',
  'further_out',
  'home_density',
  // Latent demand
  'latent_demand',
  'create_from_demand',
  // Suggestions
  'surprise_me',
  'concierge_suggest',
  // Discover
  'discover_search',
  'people_to_move_with',
  'places_nearby',
  'sports_nearby',
  // Need One More (reworked ranking; Slice 01 columns unchanged)
  'pull_in_candidates',
] as const satisfies readonly RpcName[];

/** Step 3 RPCs that take `p_idempotency_key`. */
export const liquidityIdempotentRpcs = ['create_from_demand'] as const satisfies readonly RpcName[];

/**
 * Reads that record a server analytics event. They are VOLATILE: call them with the default
 * `supabase.rpc(name, args)` (POST), never with `{ get: true }` (a read-only GET fails).
 */
export const loggedReadRpcs = [
  'ojoro_now',
  'latent_demand',
  'surprise_me',
  'concierge_suggest',
  'discover_search',
] as const satisfies readonly RpcName[];

/** Stable error codes added in Step 3 (also part of `ojoroErrorCodes`). */
export const liquidityErrorCodes = [
  'area_unknown',
  'area_required',
  'demand_unavailable',
  'demand_rate_limited',
] as const;

/** Latent demand shows only from this many people (k-anonymity); below it nothing is returned. */
export const LATENT_DEMAND_K = 3;
/** Plans formed from signals (MAKE IT HAPPEN and Down For matches) per person per 24 h. */
export const DEMAND_PLANS_PER_DAY = 5;
/** Home is low density when fewer than this many joinable plans and games are near. */
export const LOW_DENSITY_THRESHOLD = 2;

/** `discover_search(p_when)` values. */
export const discoverWhen = [
  'any',
  'now',
  'today',
  'tonight',
  'tomorrow',
  'weekend',
  'week',
] as const;
export type DiscoverWhen = (typeof discoverWhen)[number];

export type OjoroNowItem = Functions['ojoro_now']['Returns'][number];
export type LatentDemandBucket = Functions['latent_demand']['Returns'][number];
export type Suggestion = Functions['surprise_me']['Returns'][number];
export type DiscoverResult = Functions['discover_search']['Returns'][number];
export type PersonToMoveWith = Functions['people_to_move_with']['Returns'][number];
export type PlaceNearby = Functions['places_nearby']['Returns'][number];
export type HomeDensity = Functions['home_density']['Returns'][number];
export type PullInCandidate = Functions['pull_in_candidates']['Returns'][number];

/** What tapping an Ojoro Now row does: `im_down`, `join_waitlist`, or open the Activity to watch. */
export type OjoroNowAction = 'join' | 'waitlist' | 'watch';

/**
 * The arguments for MAKE IT HAPPEN from a latent demand bucket: start at the suggested time (the
 * time most of them can make), end with the bucket. Make `idempotencyKey` once per tap.
 */
export function createFromDemandArgs(
  bucket: Pick<LatentDemandBucket, 'sport_id' | 'suggested_start' | 'window_end'>,
  idempotencyKey: string,
): Functions['create_from_demand']['Args'] {
  return {
    p_sport_id: bucket.sport_id,
    p_window_start: bucket.suggested_start,
    p_window_end: bucket.window_end,
    p_idempotency_key: idempotencyKey,
  };
}
