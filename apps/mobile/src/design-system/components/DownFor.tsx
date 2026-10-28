import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { REDUCED_MOTION_FADE, useMotion } from '../motion';
import { AvatarCluster, type Person } from './AvatarCluster';
import { Button } from './Button';
import { DisplayText } from './DisplayText';
import { downForModel } from './DownFor.logic';
import { Text } from './Text';

export { downForModel } from './DownFor.logic';

export type DownForProps = {
  /** "Football". */
  activity: string;
  /** "tonight": the question reads FOOTBALL TONIGHT?. */
  when: string;
  /** The body line: an area and a rough time, never an address ("Jeanne-Mance Park · around 7:30 · 1.2 km"). */
  where: string;
  /** Everyone down, including those not drawn (the rest show as +N). */
  downCount: number;
  /** The people down, in order. The one who just joined (you, after I'M DOWN) has `isNew` and gathers in. */
  downs?: Person[] | undefined;
  /** You're down: the commit button locks to YOU'RE DOWN. */
  committed?: boolean | undefined;
  /** I'M DOWN. The owner flips `committed`, adds you to `downs` and bumps the count; no analytics here. */
  onDown?: (() => void) | undefined;
};

/** The count ticks up on Gather: rises 8pt into place. Reduced motion: a 120ms fade. */
function DownCount({ count, text }: { count: number; text: string }) {
  const { duration, easing, reduced } = useMotion('gather');
  const t = useSharedValue(1);
  const previous = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (previous.current !== undefined && count > previous.current) {
      t.value = 0;
      t.value = withTiming(1, reduced ? { duration: REDUCED_MOTION_FADE } : { duration, easing });
    }
    previous.current = count;
  }, [count, t, reduced, duration, easing]);
  const style = useAnimatedStyle(() =>
    reduced
      ? { opacity: 0.4 + 0.6 * t.value }
      : { opacity: 0.4 + 0.6 * t.value, transform: [{ translateY: 8 * (1 - t.value) }] },
  );
  return (
    <Animated.View style={style}>
      <Text variant="caption" muted style={{ fontVariant: ['tabular-nums'] }}>
        {text}
      </Text>
    </Animated.View>
  );
}

/**
 * The DOWN FOR prompt (DownFor.md, web `function DownFor`): an editorial
 * block, no card. DOWN FOR, the question at display-xl, a body line, who's
 * down, then the full-width I'M DOWN commit.
 *
 * Pressing I'M DOWN plays Commit and the light haptic (Button `commit`); the
 * owner flips `committed` and adds you to `downs` with `isNew`, and your
 * avatar gathers into the cluster while the count ticks. Screen readers hear
 * "Football tonight. 11 people down." and then the button. It sets no
 * situation: it sits on the page's ground (calm on Home). Features send
 * `downfor_viewed` and `im_down_tapped`; this component sends nothing.
 */
export function DownFor({
  activity,
  when,
  where,
  downCount,
  downs = [],
  committed = false,
  onDown,
}: DownForProps) {
  const model = downForModel({ activity, when, downCount });
  return (
    <View role="article" className="gap-space-4">
      <View accessible accessibilityLabel={model.accessibilityLabel} className="gap-space-4">
        <Text variant="overline">DOWN FOR</Text>
        <DisplayText size="xl">{model.question}</DisplayText>
        <Text variant="body" muted>
          {where}
        </Text>
        <View className="flex-row items-center gap-space-3">
          <AvatarCluster people={downs} total={model.count} />
          <DownCount count={model.count} text={model.countText} />
        </View>
      </View>
      <Button variant="commit" block committed={committed} onPress={onDown} />
    </View>
  );
}
