import { useEffect, useEffectEvent, useState } from 'react';
import { Platform, View, type DimensionValue } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useMotion } from '../motion';
import {
  SKELETON_DELAY,
  skeletonPulse,
  skeletonWait,
  textLineWidths,
  type SkeletonKind,
} from './Skeleton.logic';

export { loadingProps, SKELETON_DELAY, SKELETON_KINDS, type SkeletonKind } from './Skeleton.logic';

export type SkeletonProps = {
  /** `strip` (time block, two lines, badge) · `object` (overline, display, progress, commit) · `text` (`lines`). */
  kind?: SkeletonKind;
  /** Lines for `text`. Default 3; the last is 60% wide. */
  lines?: number;
  /** Ms before anything renders. Default 300; fast loads never flash a placeholder. */
  delay?: number;
  /**
   * When the load started (`Date.now()`), if earlier than this skeleton's
   * mount. The delay counts from here, so re-mounting rows don't restart it.
   */
  startedAt?: number | undefined;
};

/** Hidden from screen readers: the loading container announces (see `loadingProps`). */
const hidden =
  Platform.OS === 'web'
    ? ({ 'aria-hidden': true } as object)
    : ({
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants',
      } as const);

function Bar({ className, width }: { className: string; width?: DimensionValue }) {
  return <View className={`bg-track ${className}`} style={width ? { width } : undefined} />;
}

/**
 * Loading placeholder shaped like the object that's coming, ported from the
 * web `Skeleton` (`.oj-skel*`). Renders nothing until `delay` has passed, then
 * breathes on the live family (opacity 1 → 0.55, `dur-live`); static under
 * reduced motion.
 *
 * Accessibility: the skeleton is hidden from screen readers. Mark the
 * container that is loading instead, with `loadingProps('Loading plans')`
 * (label, `busy`, polite live region), and drop those props when content lands.
 */
export function Skeleton({
  kind = 'strip',
  lines = 3,
  delay = SKELETON_DELAY,
  startedAt,
}: SkeletonProps) {
  const [mountedAt] = useState(() => Date.now());
  const start = startedAt ?? mountedAt;
  const [shown, setShown] = useState(() => skeletonWait(start, Date.now(), delay) === 0);

  useEffect(() => {
    const wait = skeletonWait(start, Date.now(), delay);
    if (wait === 0) {
      setShown(true);
      return undefined;
    }
    setShown(false);
    const timer = setTimeout(() => setShown(true), wait);
    return () => clearTimeout(timer);
  }, [start, delay]);

  const live = useMotion('live');
  const pulse = skeletonPulse(live.reduced, live.duration);
  const breath = useSharedValue(1);
  // `pulse` and `live.easing` derive from `live.reduced` and `live.duration`, the real triggers.
  const startBreathing = useEffectEvent(() => {
    if (!shown || !pulse) {
      breath.value = 1;
      return false;
    }
    breath.value = pulse.from;
    breath.value = withRepeat(
      withTiming(pulse.to, { duration: pulse.halfCycle, easing: live.easing }),
      -1,
      true,
    );
    return true;
  });
  useEffect(() => {
    if (!startBreathing()) return undefined;
    return () => cancelAnimation(breath);
  }, [shown, live.reduced, live.duration, breath]);
  const style = useAnimatedStyle(() => ({ opacity: breath.value }));

  if (!shown) return null;

  let bars;
  if (kind === 'object') {
    bars = (
      <View className="gap-space-4 bg-surface-raised p-space-6">
        <Bar className="h-[12px]" width="30%" />
        <Bar className="h-[52px]" width="60%" />
        <Bar className="h-[8px]" />
        <Bar className="h-commit rounded-pill" />
      </View>
    );
  } else if (kind === 'text') {
    bars = (
      <View className="gap-space-2">
        {textLineWidths(lines).map((width, i) => (
          <Bar key={i} className="h-[12px]" width={width} />
        ))}
      </View>
    );
  } else {
    bars = (
      <View className="flex-row items-center gap-space-4">
        <Bar className="h-[28px] w-[64px]" />
        <View className="flex-1 gap-space-2">
          <Bar className="h-[12px]" width="70%" />
          <Bar className="h-[12px]" width="40%" />
        </View>
        <Bar className="h-[22px] w-[48px]" />
      </View>
    );
  }

  // Reanimated drives the breath through `style`; layout classes stay on plain Views.
  return (
    <Animated.View style={style} {...hidden}>
      {bars}
    </Animated.View>
  );
}
