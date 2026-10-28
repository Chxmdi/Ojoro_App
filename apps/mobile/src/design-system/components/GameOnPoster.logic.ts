/**
 * Pure rules for `GameOnPoster` (web reference `function GameOnPoster`;
 * components/GameOnPoster.md). No React Native imports, so it runs in Node.
 */

/** Avatars shown before +N on the poster (web: `max: 8`). */
export const GAME_ON_CLUSTER_MAX = 8;

export type GameOnPosterModelInput = {
  activity: string;
  time: string;
  place: string;
  count?: number | undefined;
};

export type GameOnMeta = { label: 'WHAT' | 'WHEN' | 'WHERE'; value: string };

export type GameOnPosterModel = {
  /** "CONFIRMED · 8 IN", or "CONFIRMED" when the count isn't known. */
  overline: string;
  /** The hero, one word per line. */
  hero: readonly ['GAME', 'ON'];
  meta: GameOnMeta[];
  /** "Game on. Football, Tonight 7:30, Jeanne-Mance Park." */
  accessibilityLabel: string;
};

export function gameOnPosterModel({
  activity,
  time,
  place,
  count,
}: GameOnPosterModelInput): GameOnPosterModel {
  const n =
    count !== undefined && Number.isFinite(count) && count > 0 ? Math.floor(count) : undefined;
  return {
    // The web writes "CONFIRMED ·  IN" when count is missing; drop the clause instead.
    overline: n === undefined ? 'CONFIRMED' : `CONFIRMED · ${n} IN`,
    hero: ['GAME', 'ON'],
    meta: [
      { label: 'WHAT', value: activity },
      { label: 'WHEN', value: time },
      { label: 'WHERE', value: place },
    ],
    accessibilityLabel: `Game on. ${activity}, ${time}, ${place}.`,
  };
}

/**
 * Breakthrough plays when the poster is in a "just happened" context: on
 * first render with `celebrate`, or when `celebrate` turns on. Never again
 * while it stays on, and never when it's off.
 */
export function shouldCelebrate(previous: boolean | undefined, next: boolean): boolean {
  return next && previous !== true;
}
