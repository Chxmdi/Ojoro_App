/**
 * Pure rules for `PassportStamp` (web reference `function PassportStamp` and
 * `.oj-stamp`; components/PassportStamp.md). No React Native imports.
 */

/** The ring's outer size (`.oj-stamp-ring`: 168 × 168). */
export const STAMP_SIZE = 168;
/** Outer ring stroke (`border: 3px`). */
export const STAMP_RING = 3;
/** Gap between the rings (`inset 0 0 0 5px var(--surface)`). */
export const STAMP_GAP = 5;
/** Inner ring stroke (`inset 0 0 0 6px currentColor`, 1px past the gap). */
export const STAMP_INNER_RING = 1;
/** The stamp's slant, like a real stamp (`rotate(-6deg)`). */
export const STAMP_TILT = '-6deg';
/** When no kind is given. */
export const STAMP_DEFAULT_KIND = 'OJORO PASSPORT';

export type StampModel = {
  kind: string;
  /** `null` when flat (`tilt === false`). */
  rotate: string | null;
  /** "21 GAMES, Jeanne-Mance, 06.10.26". */
  accessibilityLabel: string;
};

export function stampModel({
  title,
  place,
  date,
  kind,
  tilt,
}: {
  title: string;
  place: string;
  date: string;
  kind?: string | undefined;
  tilt?: boolean | undefined;
}): StampModel {
  return {
    kind: kind || STAMP_DEFAULT_KIND,
    rotate: tilt === false ? null : STAMP_TILT,
    accessibilityLabel: `${title}, ${place}, ${date}`,
  };
}
