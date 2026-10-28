import { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useMotion } from '../motion';
import { useThemeColor } from '../useThemeColor';
import { newlyFilled, progressModel } from './Progress.logic';

export type ProgressProps = {
  /** Filled segments. Over `max` shows full. */
  value: number;
  /** Number of segments, one per spot. Default 8. */
  max?: number | undefined;
  /** Spoken label, in words ("6 of 8 committed"). Default "6 of 8". */
  label?: string | undefined;
  className?: string | undefined;
};

const isWeb = Platform.OS === 'web';

function Segment({ on, gather }: { on: boolean; gather: boolean }) {
  const timing = useMotion('gather');
  const signal = useThemeColor('signal');
  const fill = useSharedValue(on ? 1 : 0);
  // Read when `on` changes, so a later re-render (gather back to false) can't cut the fill short.
  const plan = useRef({ gather, timing });
  plan.current = { gather, timing };

  useEffect(() => {
    const { gather: animate, timing: t } = plan.current;
    const target = on ? 1 : 0;
    fill.value =
      animate && on && !t.reduced ? withTiming(target, { duration: t.duration, easing: t.easing }) : target;
  }, [on, fill]);

  // The fill grows from the left edge; the gather ease overshoots a touch and is clipped by the segment.
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.value }] }));

  return (
    <View className="h-[8px] flex-1 overflow-hidden rounded-xs bg-track">
      <Animated.View
        style={[{ flex: 1, backgroundColor: signal, transformOrigin: 'left' }, fillStyle]}
      />
    </View>
  );
}

/**
 * Segmented count (Progress.md, web `function Progress`): one segment per
 * spot, `space-1` gaps, filled `signal`, empty `track`, so 6 / 8 can be counted
 * without colour. When the value goes up, the new segments fill on dur-gather;
 * under reduced motion they fill at once.
 */
export function Progress({ value, max, label, className }: ProgressProps) {
  const model = progressModel(value, max, label);
  const previous = useRef<number | undefined>(undefined);
  const gathering = newlyFilled(previous.current, model.now);
  useEffect(() => {
    previous.current = model.now;
  }, [model.now]);

  const a11y = isWeb
    ? {
        role: 'progressbar' as const,
        'aria-valuemin': 0,
        'aria-valuemax': model.max,
        'aria-valuenow': model.now,
        'aria-label': model.label,
      }
    : {
        accessible: true,
        accessibilityRole: 'progressbar' as const,
        accessibilityValue: { min: 0, max: model.max, now: model.now, text: model.label },
        accessibilityLabel: model.label,
      };

  return (
    <View {...a11y} className={['flex-row gap-space-1', className].filter(Boolean).join(' ')}>
      {model.segments.map((on, i) => (
        <Segment key={i} on={on} gather={gathering.has(i)} />
      ))}
    </View>
  );
}
