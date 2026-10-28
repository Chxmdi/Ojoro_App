import { useContext, useLayoutEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { haptics } from '../haptics';
import { REDUCED_MOTION_FADE, useMotion } from '../motion';
import { Situation } from '../Situation';
import { AvatarCluster, type Person } from './AvatarCluster';
import { DisplayText, usePosterWidth } from './DisplayText';
import { GAME_ON_CLUSTER_MAX, gameOnPosterModel, shouldCelebrate } from './GameOnPoster.logic';
import { ReducedMotionOverride } from './Overlay';
import { Text } from './Text';

export { gameOnPosterModel, shouldCelebrate } from './GameOnPoster.logic';

export type GameOnPosterProps = {
  activity: string;
  time: string;
  /** An area, never an address. */
  place: string;
  /** Everyone in: "CONFIRMED · 8 IN", and the cluster's total. */
  count?: number | undefined;
  /** Everyone in. Omit to draw no cluster (web: `p.people ? … : null`). */
  people?: Person[] | undefined;
  /**
   * A "just happened" context (the GAME ON takeover the moment a plan fills):
   * the poster arrives via Breakthrough and plays the success haptic. Plays on
   * mount with `celebrate`, or when it turns on; never in a feed or on revisit.
   */
  celebrate?: boolean | undefined;
};

/**
 * Breakthrough (README Motion; web `@keyframes oj-break`): the confirmed ground
 * wipes down from the top over dur-breakthrough, `clip-path: inset(0 0 100% 0)`
 * → `inset(0)`, without moving layout. The clip box slides up by (1 − t)·H and
 * its content slides back down by the same amount, so only the top t·H shows.
 * `play()` starts it and plays the success haptic. Reduced motion: the object
 * cross-fades in over 120ms instead.
 *
 * Shared by GameOnPoster and ActivityObject (forming → confirmed).
 */
export function useBreakthroughWipe(startHidden: boolean) {
  const system = useMotion('breakthrough');
  // Stories can force the reduced path (ReducedMotionOverride); otherwise the system setting.
  const reduced = useContext(ReducedMotionOverride) ?? system.reduced;
  const duration = reduced ? 0 : system.duration;
  const easing = system.easing;
  const t = useSharedValue(startHidden ? 0 : 1);
  const height = useSharedValue(0);

  const play = () => {
    t.value = 0;
    t.value = withTiming(1, reduced ? { duration: REDUCED_MOTION_FADE } : { duration, easing });
    void haptics.gameOn();
  };

  const box = useAnimatedStyle(() => {
    if (reduced) return { opacity: t.value };
    // Before the first layout there's no height to clip with: stay hidden until there is.
    if (height.value === 0 && t.value < 1) return { opacity: 0 };
    return { opacity: 1, transform: [{ translateY: -(1 - t.value) * height.value }] };
  });
  const content = useAnimatedStyle(() =>
    reduced ? {} : { transform: [{ translateY: (1 - t.value) * height.value }] },
  );
  const onLayout = (e: LayoutChangeEvent) => {
    height.value = e.nativeEvent.layout.height;
  };
  return { t, box, content, onLayout, play, reduced, duration };
}

/** The hero scales in as the ground takes over (README: "GAME ON scales in at display-hero"). */
export function useScaleIn(t: SharedValue<number>, reduced: boolean) {
  return useAnimatedStyle(() =>
    reduced ? {} : { opacity: t.value, transform: [{ scale: 0.6 + 0.4 * t.value }] },
  );
}

/**
 * The GAME ON poster (GameOnPoster.md, web `function GameOnPoster`): a
 * full-bleed object that always sets the confirmed situation on its own root,
 * so it turns oxblood inside a calm feed. GAME ON at display-hero, sized to the
 * poster (29% of its content width, 64–120), then WHAT / WHEN / WHERE in UI
 * type under a hairline, then everyone in. One per screen.
 *
 * With `celebrate`, it arrives via Breakthrough with the success haptic, and
 * screen readers hear "Game on. Football, Tonight 7:30, Jeanne-Mance Park."
 * Posters are full-width blocks: don't put one in a row that shrinks to fit.
 */
export function GameOnPoster({
  activity,
  time,
  place,
  count,
  people,
  celebrate = false,
}: GameOnPosterProps) {
  const model = gameOnPosterModel({ activity, time, place, count });
  const [width, onPosterLayout] = usePosterWidth();
  const wipe = useBreakthroughWipe(celebrate);
  const heroStyle = useScaleIn(wipe.t, wipe.reduced);

  const previous = useRef<boolean | undefined>(undefined);
  useLayoutEffect(() => {
    const play = shouldCelebrate(previous.current, celebrate);
    previous.current = celebrate;
    if (!play) return;
    wipe.play();
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(model.accessibilityLabel);
    // `wipe.play` and the label are read fresh on each change of `celebrate`; that's the only trigger.
  }, [celebrate]);

  return (
    <View role="article" style={styles.root}>
      <Animated.View style={[styles.clip, wipe.box]} onLayout={wipe.onLayout}>
        <Animated.View style={wipe.content}>
          <Situation
            id="confirmed"
            className="p-space-6"
            accessible
            accessibilityLabel={model.accessibilityLabel}
            accessibilityLiveRegion={celebrate ? 'polite' : 'none'}
          >
            <View className="gap-space-5" onLayout={onPosterLayout}>
              <Text variant="overline">{model.overline}</Text>
              <Animated.View style={[styles.heroOrigin, heroStyle]}>
                <DisplayText size="hero" posterWidth={width}>
                  {model.hero.join('\n')}
                </DisplayText>
              </Animated.View>
              <View className="flex-row gap-space-4 border-t border-line pt-space-4">
                {model.meta.map((m) => (
                  <View key={m.label} className="min-w-0 flex-1">
                    <Text variant="label" muted>
                      {m.label}
                    </Text>
                    <Text variant="title">{m.value}</Text>
                  </View>
                ))}
              </View>
              {people ? (
                <AvatarCluster people={people} total={count} max={GAME_ON_CLUSTER_MAX} />
              ) : null}
            </View>
          </Situation>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: 'stretch' },
  clip: { overflow: 'hidden' },
  heroOrigin: { alignSelf: 'flex-start', transformOrigin: 'left bottom' },
});
