import { brand, borderWidth } from '@ojoro/design-tokens';
import type { Href } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useMotion } from '../motion';
import { useThemeColor } from '../useThemeColor';
import { activityStripLabel, activityTag, type ActivityStatus } from './ActivityStrip.logic';
import { Badge } from './Badge';
import { Strip } from './Strip';
import { Text } from './Text';

export { ACTIVITY_STATUSES, type ActivityStatus } from './ActivityStrip.logic';

export type ActivityStripProps = {
  activity: string;
  /** Set in the display face in the 72pt leading column ("7:30"). */
  time: string;
  /** An area, never an address ("Parc Jarry · 4 km"). */
  place: string;
  count?: number | undefined;
  capacity?: number | undefined;
  /** `forming` (count boxed, default) · `confirmed` (GAME ON) · `live` (LIVE) · `full` (FULL). */
  status?: ActivityStatus | undefined;
  /** Opens the activity (Expo Router). The whole row is one link. */
  href?: Href | undefined;
  onPress?: (() => void) | undefined;
};

/**
 * The LIVE tag as `.oj-live` draws it: an oxblood pill with a 2px white
 * `mark-ring` (oxblood merges with black and ink), a white dot pulsing on
 * dur-live, and the word LIVE in white. Reduced motion: the dot holds still.
 *
 * Local to ActivityStrip until `LiveIndicator` is ported; replace it then.
 */
function LiveTag() {
  const ring = useThemeColor('mark-ring');
  const live = useMotion('live');
  const dot = useSharedValue(1);
  useEffect(() => {
    if (live.reduced) {
      dot.value = 1;
      return undefined;
    }
    // `@keyframes oj-pulse`: 1 → .35 → 1 over one dur-live cycle.
    dot.value = withRepeat(withTiming(0.35, { duration: live.duration / 2, easing: live.easing }), -1, true);
    return () => cancelAnimation(dot);
  }, [live.reduced, live.duration, live.easing, dot]);
  const dotStyle = useAnimatedStyle(() => ({ opacity: dot.value }));
  return (
    <View
      className="flex-row items-center gap-space-2 rounded-pill px-space-3 py-space-1"
      style={{
        backgroundColor: brand['brand-oxblood'],
        boxShadow: `0 0 0 ${borderWidth['border-strong']}px ${ring}`,
      }}
    >
      <Animated.View
        className="rounded-disc"
        style={[{ width: 8, height: 8, backgroundColor: brand['brand-white'] }, dotStyle]}
      />
      <Text
        variant="label"
        style={{ fontSize: 12, lineHeight: 16, letterSpacing: 1.44, color: brand['brand-white'] }}
      >
        LIVE
      </Text>
    </View>
  );
}

/**
 * Compact one-line activity (ActivityStrip.md, web `function ActivityStrip`):
 * the time in display type, name and place in UI type, status at the end. Built
 * on `Strip`, so strips stack on `line` hairlines, never as cards, and the
 * whole row is one link at least 44pt tall.
 */
export function ActivityStrip({
  activity,
  time,
  place,
  count,
  capacity,
  status = 'forming',
  href,
  onPress,
}: ActivityStripProps) {
  const tag = activityTag(status, count, capacity);
  return (
    <Strip
      leading={time}
      title={activity}
      meta={place}
      trailing={tag.kind === 'live' ? <LiveTag /> : <Badge tone={tag.tone}>{tag.text}</Badge>}
      href={href}
      onPress={onPress}
      accessibilityLabel={activityStripLabel({ activity, time, place, status })}
    />
  );
}
