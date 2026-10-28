/**
 * Pure rules for `Progress` (web reference `function Progress` and `.oj-progress`).
 * No React Native imports, so it runs in Node.
 */

/** Default number of segments, one per spot (web: `p.max || 8`). */
export const DEFAULT_MAX = 8;

export type ProgressModel = {
  max: number;
  /** Filled segments: 0 ≤ now ≤ max. Over max shows full, as on the web. */
  now: number;
  /** One boolean per segment, true when filled. */
  segments: boolean[];
  /** Spoken label: the caller's words, or "6 of 8". */
  label: string;
};

export function progressModel(value: number | undefined, max?: number, label?: string): ProgressModel {
  const m = max && max > 0 ? Math.floor(max) : DEFAULT_MAX;
  const v = value && value > 0 ? Math.floor(value) : 0;
  const now = Math.min(v, m);
  return {
    max: m,
    now,
    segments: Array.from({ length: m }, (_, i) => i < now),
    label: label || `${now} of ${m}`,
  };
}

/**
 * Segments that should play the gather fill: those that just became filled
 * because the value went up. Nothing animates on first render or on a decrease.
 */
export function newlyFilled(previous: number | undefined, now: number): Set<number> {
  const out = new Set<number>();
  if (previous === undefined || now <= previous) return out;
  for (let i = Math.max(previous, 0); i < now; i++) out.add(i);
  return out;
}
