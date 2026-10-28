/**
 * Pure rules for `PlaceMiniCard` (`function PlaceMiniCard` and `.oj-place*` in
 * the web reference; components/PlaceMiniCard.md). No React Native imports.
 */

export type PlaceParts = {
  name: string;
  kind: string;
  surface?: string | undefined;
  distance?: string | undefined;
  lights?: string | undefined;
  plansTonight?: number | undefined;
};

/** The muted line: kind · surface · distance (web joins the present parts with " · "). */
export function placeMeta({ kind, surface, distance }: PlaceParts): string {
  return [kind, surface, distance].filter(Boolean).join(' · ');
}

/** "Floodlit until 11 PM", or null when the place has no lights. */
export function placeLights(lights: string | undefined): string | null {
  return lights ? `Floodlit until ${lights}` : null;
}

/** The count shown on the right, or null when there are no plans tonight. */
export function plansTonightCount(plansTonight: number | undefined): number | null {
  return plansTonight != null && Number.isFinite(plansTonight) && plansTonight > 0
    ? Math.floor(plansTonight)
    : null;
}

/**
 * One link, read as: name, kind, surface, distance, floodlit until, N plans
 * tonight. The web reads name, kind, distance and the count; surface and
 * lights are added because they're visible on the card.
 */
export function placeLabel(p: PlaceParts): string {
  const n = plansTonightCount(p.plansTonight);
  return [
    p.name,
    p.kind,
    p.surface,
    p.distance,
    p.lights ? `floodlit until ${p.lights}` : null,
    n ? `${n} ${n === 1 ? 'plan' : 'plans'} tonight` : null,
  ]
    .filter(Boolean)
    .join(', ');
}
