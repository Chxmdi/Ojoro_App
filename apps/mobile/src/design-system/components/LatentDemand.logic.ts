/**
 * Pure rules for `LatentDemand`: aggregate demand with no plan yet (Discover's
 * "NOTHING ON FOR VOLLEYBALL" panel, FirstHome's "PEOPLE WANT THIS" band).
 * PRD §9.6: surface aggregate latent demand when nothing suitable exists;
 * SCREENS.md: shown as a count only, no names or locations until people join.
 * No React Native imports, so it runs in Node.
 */

export const LATENT_DEMAND_VARIANTS = ['panel', 'band'] as const;
export type LatentDemandVariant = (typeof LATENT_DEMAND_VARIANTS)[number];

/** The privacy line under each variant, from the prototypes. */
export const LATENT_DEMAND_NOTE: Record<LatentDemandVariant, string> = {
  panel: "Shown as a count. Nobody's name or location is shared until they join.",
  band: 'Shown as a count. Names appear once the plan forms.',
};

export type LatentDemandInput = {
  variant?: LatentDemandVariant | undefined;
  /** People who want it. A count, never a list. */
  count: number;
  /** The plan forms at this many (FirstHome's "becomes a plan at 4"). */
  threshold?: number | undefined;
  note?: string | undefined;
};

export type LatentDemandModel = {
  count: number;
  /** Segments for the band's Progress, or null without a threshold. */
  progress: { value: number; max: number; label: string } | null;
  note: string;
};

function whole(n: number | undefined): number {
  return n != null && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Null when nobody wants it: zero people isn't demand, and the screen shows
 * its next action instead (never a dead end, PRD §9.6). The progress label is
 * the prototype's "3 of 4 needed"; a threshold at or under the count shows full.
 */
export function latentDemandModel({
  variant = 'panel',
  count,
  threshold,
  note,
}: LatentDemandInput): LatentDemandModel | null {
  const n = whole(count);
  if (!n) return null;
  const max = whole(threshold);
  return {
    count: n,
    progress: max
      ? { value: Math.min(n, max), max, label: `${Math.min(n, max)} of ${max} needed` }
      : null,
    note: note ?? LATENT_DEMAND_NOTE[variant],
  };
}
