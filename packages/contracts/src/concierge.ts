/**
 * Step 8 (AI Movement Concierge, PRD §12.1, §12.3) client contract helpers. The full contract is
 * docs/CONCIERGE_CONTRACT.md. The app calls the Edge Function `concierge` (POST { text }) and gets a
 * `ConciergeAnswer`; if the function can't be reached it calls `concierge_suggest` itself and shapes
 * the rows with `answerFromSuggestions`, so Tell Ojoro always answers.
 *
 * The shape mirrors supabase/functions/concierge/logic.ts (a test checks the two agree).
 * Pure TypeScript with no runtime dependencies.
 */
import type { Database } from './database.types';
import type { Suggestion } from './liquidity';

type Functions = Database['public']['Functions'];
type RpcName = keyof Functions;

/** The Edge Function's name (`supabase.functions.invoke(conciergeFunction, { body: { text } })`). */
export const conciergeFunction = 'concierge' as const;

/** RPCs the app may call for the Concierge. `concierge_ai_gate` / `_record` are service-role only. */
export const conciergeRpcs = ['concierge_candidates', 'concierge_suggest'] as const satisfies readonly RpcName[];

/** Service-role RPCs (the Edge Function only; people get permission denied). */
export const conciergeServiceRpcs = ['concierge_ai_gate', 'concierge_ai_record'] as const satisfies readonly RpcName[];

export const conciergeStartOptions = ['down_for', 'quick_plan', 'activity', 'call_out'] as const;
export type ConciergeStart = (typeof conciergeStartOptions)[number];

export const conciergeOutcomes = ['match', 'nothing_fits', 'not_movement'] as const;
export type ConciergeOutcome = (typeof conciergeOutcomes)[number];

/**
 * Why the rules answered instead of Claude. `unreachable` is the app's own: the function couldn't
 * be reached and the app asked `concierge_suggest` directly.
 */
export const conciergeFallbackReasons = [
  'no_key',
  'injection_suspected',
  'rate_limited',
  'timeout',
  'refusal',
  'invalid_output',
  'error',
  'unreachable',
] as const;
export type ConciergeFallbackReason = (typeof conciergeFallbackReasons)[number];

/** A suggestion row (`Suggestion`) plus whether it matches what Ojoro read from the text. */
export type ConciergeIdea = Suggestion & { matched: boolean };

export interface ConciergeAnswer {
  source: 'ai' | 'rules';
  fallback_reason: ConciergeFallbackReason | null;
  outcome: ConciergeOutcome;
  /** The one best match, or null (nothing fits / not about moving). */
  best: ConciergeIdea | null;
  /** Completes "Why: …" (no prefix, no final period). Null without a best match. */
  why: string | null;
  /** Up to 2 other ideas. */
  more: ConciergeIdea[];
  /** The way to start something when nothing fits. */
  start: ConciergeStart | null;
  /** A sport to prefill Down For with. */
  sport_id: string | null;
}

/** The most other ideas an answer carries. */
export const CONCIERGE_MORE_IDEAS = 2;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const strOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string';

function isIdea(v: unknown): v is ConciergeIdea {
  return (
    isObj(v) &&
    (v.kind === 'plan' || v.kind === 'demand') &&
    typeof v.sport_id === 'string' &&
    typeof v.sport_name === 'string' &&
    typeof v.starts_at === 'string' &&
    strOrNull(v.plan_id ?? null) &&
    (v.kind !== 'plan' || typeof v.plan_id === 'string')
  );
}

/**
 * Checks a response body at the app boundary. Null for anything that isn't a ConciergeAnswer
 * (the app then asks `concierge_suggest` itself).
 */
export function parseConciergeAnswer(body: unknown): ConciergeAnswer | null {
  if (!isObj(body)) return null;
  const { source, fallback_reason, outcome, best, why, more, start, sport_id } = body;
  if (source !== 'ai' && source !== 'rules') return null;
  if (fallback_reason !== null && !conciergeFallbackReasons.includes(fallback_reason as ConciergeFallbackReason)) return null;
  if (!conciergeOutcomes.includes(outcome as ConciergeOutcome)) return null;
  if (best !== null && !isIdea(best)) return null;
  if (!strOrNull(why) || !strOrNull(sport_id)) return null;
  if (start !== null && !conciergeStartOptions.includes(start as ConciergeStart)) return null;
  if (!Array.isArray(more) || !more.every(isIdea)) return null;
  if (outcome === 'match' && best === null) return null;
  return {
    source,
    fallback_reason: fallback_reason as ConciergeFallbackReason | null,
    outcome: outcome as ConciergeOutcome,
    best: best as ConciergeIdea | null,
    why: why as string | null,
    more: (more as ConciergeIdea[]).slice(0, CONCIERGE_MORE_IDEAS),
    start: start as ConciergeStart | null,
    sport_id: sport_id as string | null,
  };
}

/** The rules answer from `concierge_suggest` rows (the app's own fallback). */
export function answerFromSuggestions(rows: readonly Suggestion[], reason: ConciergeFallbackReason = 'unreachable'): ConciergeAnswer {
  const ideas = rows.map((r) => ({ ...r, matched: true }));
  const best = ideas[0] ?? null;
  return {
    source: 'rules',
    fallback_reason: reason,
    outcome: best ? 'match' : 'nothing_fits',
    best,
    why: best?.reason?.trim().replace(/\.$/, '') || null,
    more: ideas.slice(1, 1 + CONCIERGE_MORE_IDEAS),
    start: best ? null : 'down_for',
    sport_id: null,
  };
}
