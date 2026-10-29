import { brand, borderWidth } from '@ojoro/design-tokens';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { motion } from '../motion';
import { useThemeColor } from '../useThemeColor';
import { LIVE_PULSE_LOW, liveLabel, liveWord } from './LiveIndicator.logic';
import { useOverlayReducedMotion } from './Overlay';
import { Text } from './Text';

export {
  LIVE_COUNTER_LOW,
  LIVE_PULSE_LOW,
  LIVE_WORD,
  liveLabel,
  liveWord,
} from './LiveIndicator.logic';

export type LiveIndicatorProps = {
  /** The word on the pill. Default LIVE. Pulse uses SPARRING. */
  label?: string | undefined;
  /**
   * Part of a picture that is described elsewhere (Pulse's map) or inside an
   * object that speaks its own status (ActivityStrip, ActivityObject): hidden
   * from screen readers. Default false: the pill is a status that reads its word.
   */
  decorative?: boolean | undefined;
  testID?: string | undefined;
};

/**
 * The Live motion family's pulse (`@keyframes oj-pulse`): opacity 1 → .35 → 1
 * over one dur-live cycle, on the UI thread. Opacity only, so the layout never
 * moves. Reduced motion, or `active` false: it holds still at full opacity.
 * Use it for the LIVE dot and live counters (a running clock), nothing else.
 * Counters dim only to `LIVE_COUNTER_LOW` so the figures stay readable.
 */
export function useLivePulse(active = true, low: number = LIVE_PULSE_LOW) {
  const live = motion.live;
  const reduced = useOverlayReducedMotion();
  const value = useSharedValue(1);
  const run = active && !reduced;
  useEffect(() => {
    if (!run) {
      cancelAnimation(value);
      value.value = 1;
      return undefined;
    }
    value.value = withRepeat(
      withTiming(low, { duration: live.duration / 2, easing: live.easing }),
      -1,
      true,
    );
    return () => cancelAnimation(value);
  }, [run, low, live.duration, live.easing, value]);
  return useAnimatedStyle(() => ({ opacity: value.value }));
}

const hiddenProps =
  Platform.OS === 'web'
    ? { 'aria-hidden': true as const }
    : {
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants' as const,
      };

/**
 * The LIVE pill (LiveIndicator.md, web `function LiveIndicator`): oxblood, a
 * 2px white `mark-ring` (oxblood and black merge at 1.09:1, so the ring is
 * never removed), a white dot pulsing on dur-live and the word in white,
 * 12/16 Inter 700 at 0.12em. Brand colours on purpose: the pill is oxblood on
 * every situation. One per screen. It sizes to its content in a row; in a
 * column, wrap it in a row (or `self-start`) so it doesn't stretch.
 */
export function LiveIndicator({ label, decorative = false, testID }: LiveIndicatorProps) {
  const ring = useThemeColor('mark-ring');
  const dot = useLivePulse();
  const a11y = decorative
    ? hiddenProps
    : { role: 'status' as const, accessible: true, 'aria-label': liveLabel(label) };
  return (
    <View
      testID={testID}
      {...a11y}
      className="flex-row items-center gap-space-2 rounded-pill px-space-3 py-space-1"
      style={{
        backgroundColor: brand['brand-oxblood'],
        boxShadow: `0 0 0 ${borderWidth['border-strong']}px ${ring}`,
      }}
    >
      <Animated.View
        className="rounded-disc"
        style={[{ width: 8, height: 8, backgroundColor: brand['brand-white'] }, dot]}
      />
      <Text
        variant="label"
        style={{ fontSize: 12, lineHeight: 16, letterSpacing: 1.44, color: brand['brand-white'] }}
      >
        {liveWord(label)}
      </Text>
    </View>
  );
}
