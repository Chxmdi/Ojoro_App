/**
 * Pure rules for `Skeleton` (design-system/components/Skeleton.md, the web
 * reference `Skeleton` / `.oj-skel*`, and README › Feedback: "show a Skeleton
 * shaped like the coming object only after 300ms"). No React Native imports.
 */

export const SKELETON_KINDS = ['strip', 'object', 'text'] as const;
export type SkeletonKind = (typeof SKELETON_KINDS)[number];

/** Nothing shows for the first 300ms of a load: fast loads never flash a placeholder. */
export const SKELETON_DELAY = 300;

/**
 * Milliseconds left before the skeleton may show, counted from when the load
 * started (not from when this skeleton mounted, so a re-render or a list that
 * re-mounts its rows doesn't restart the wait). 0 means show now.
 */
export function skeletonWait(startedAt: number, now: number, delay = SKELETON_DELAY): number {
  const safeDelay = Number.isFinite(delay) ? Math.max(0, delay) : SKELETON_DELAY;
  return Math.max(0, startedAt + safeDelay - now);
}

/** Lines of the `text` kind: every line full width but the last, at 60%. Default 3, at least 1. */
export function textLineWidths(lines = 3): `${number}%`[] {
  const count = Number.isFinite(lines) ? Math.max(1, Math.floor(lines)) : 3;
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? '60%' : '100%'));
}

/**
 * The live-family breath (`@keyframes oj-skel`): opacity 1 → 0.55 → 1 over
 * `dur-live`. Under reduced motion there is no pulse: null, a static ground.
 */
export function skeletonPulse(reduced: boolean, durLive: number) {
  if (reduced) return null;
  return { from: 1, to: 0.55, halfCycle: durLive / 2 } as const;
}

/**
 * The skeleton itself is hidden from screen readers: the container that is
 * loading announces it. Spread these on that container while it loads:
 *
 * ```tsx
 * <View {...loadingProps('Loading plans')}>
 *   <Skeleton kind="strip" />
 *   <Skeleton kind="strip" />
 * </View>
 * ```
 *
 * One focusable element with the label and `busy`; Android announces it as a
 * polite live region, VoiceOver reads it when focus reaches it.
 */
export function loadingProps(label: string) {
  return {
    accessible: true,
    accessibilityLabel: label,
    accessibilityState: { busy: true },
    accessibilityLiveRegion: 'polite',
  } as const;
}
