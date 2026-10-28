import { duration, easing } from '@ojoro/design-tokens';
import { Easing, useReducedMotion } from 'react-native-reanimated';

/** The four motion families. Durations in ms, easing as Reanimated bezier functions. */
export const motion = {
  commit: { duration: duration['dur-commit'], easing: Easing.bezier(...easing['ease-commit']) },
  gather: { duration: duration['dur-gather'], easing: Easing.bezier(...easing['ease-gather']) },
  breakthrough: {
    duration: duration['dur-breakthrough'],
    easing: Easing.bezier(...easing['ease-breakthrough']),
  },
  live: { duration: duration['dur-live'], easing: Easing.bezier(...easing['ease-live']) },
} as const;

export type MotionFamily = keyof typeof motion;

/** Commit press scale. */
export const COMMIT_SCALE = 0.96;

/** Under reduced motion, state changes become cross-fades of at most this long. */
export const REDUCED_MOTION_FADE = 120;

/**
 * Timing for a motion family that respects reduced motion: duration 0, and the
 * caller should cross-fade instead of moving (`reduced` tells it which).
 */
export function useMotion(family: MotionFamily) {
  const reduced = useReducedMotion();
  const spec = motion[family];
  return reduced ? { duration: 0, easing: spec.easing, reduced: true } : { ...spec, reduced: false };
}
