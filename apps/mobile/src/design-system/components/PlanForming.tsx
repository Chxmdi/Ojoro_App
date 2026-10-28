import { opacity } from '@ojoro/design-tokens';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
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
import { Button } from './Button';
import {
  isBreakthrough,
  isGather,
  PLAN_CLUSTER_MAX,
  planModel,
  type PlanModel,
  type PlanVariant,
} from './PlanForming.logic';
import { Progress } from './Progress';
import { Text } from './Text';

export { planVariant, planModel, PLAN_VARIANTS, type PlanVariant } from './PlanForming.logic';

export type PlanFormingProps = {
  activity: string;
  count: number;
  capacity: number;
  /** The people in. The one who just joined has `isNew` and gathers in. */
  participants?: Person[] | undefined;
  time: string;
  /** An area, never an address. */
  place: string;
  /**
   * Who can see and join. Part of the contract; the web reference doesn't draw
   * it on the object, so neither does this (the plan screen states it).
   */
  privacy?: 'open' | 'crew' | 'invite' | undefined;
  /** Forces a variant; otherwise derived from count / capacity (`planVariant`). */
  variant?: PlanVariant | undefined;
  expired?: boolean | undefined;
  /** You're in: the commit button reads YOU'RE DOWN. */
  joined?: boolean | undefined;
  /** I'M DOWN. The owner flips `joined` and the count; this component fires no analytics. */
  onJoin?: (() => void) | undefined;
  /** PULL SOMEONE IN, on NEED ONE MORE. */
  onInvite?: (() => void) | undefined;
  /** OPEN GAME, once it's GAME ON. */
  onOpen?: (() => void) | undefined;
};

/** The count ticks up on Gather: rises 12pt into place. Reduced motion: a 120ms fade. */
function Count({ count, text }: { count: number; text: string }) {
  const { duration, easing, reduced } = useMotion('gather');
  const t = useSharedValue(1);
  const previous = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (isGather(previous.current, count)) {
      t.value = 0;
      t.value = withTiming(1, reduced ? { duration: REDUCED_MOTION_FADE } : { duration, easing });
    }
    previous.current = count;
  }, [count, t, reduced, duration, easing]);
  const style = useAnimatedStyle(() =>
    reduced
      ? { opacity: 0.4 + 0.6 * t.value }
      : { opacity: 0.4 + 0.6 * t.value, transform: [{ translateY: 12 * (1 - t.value) }] },
  );
  return (
    <Animated.View style={style}>
      <Text variant="display-lg" style={{ fontVariant: ['tabular-nums'] }}>
        {text}
      </Text>
    </Animated.View>
  );
}

type BodyProps = {
  model: PlanModel;
  count: number;
  capacity: number;
  participants: Person[];
  place: string;
  joined: boolean;
  onJoin?: (() => void) | undefined;
  onInvite?: (() => void) | undefined;
  onOpen?: (() => void) | undefined;
  /** Breakthrough progress for the GAME ON headline (scales in); absent when not breaking. */
  headIn?: SharedValue<number> | undefined;
  reduced: boolean;
};

/** The plan as drawn on its own situation ground (`.oj-plan`: grid, gap 16, padding 24). */
function PlanBody({
  model,
  count,
  capacity,
  participants,
  place,
  joined,
  onJoin,
  onInvite,
  onOpen,
  headIn,
  reduced,
}: BodyProps) {
  const fallback = useSharedValue(1);
  const k = headIn ?? fallback;
  const headStyle = useAnimatedStyle(() =>
    reduced ? {} : { opacity: k.value, transform: [{ scale: 0.6 + 0.4 * k.value }] },
  );
  return (
    <Situation
      id={model.situation}
      className="gap-space-4 p-space-6"
      style={model.dimmed ? { opacity: opacity['opacity-expired'] } : null}
    >
      {/* Headline, status and people read as one sentence; the button stays its own target. */}
      <View
        accessible
        accessibilityLabel={model.accessibilityLabel}
        accessibilityLiveRegion="polite"
        className="gap-space-4"
      >
        <View className="flex-row items-baseline justify-between gap-space-3">
          <Text variant="overline">{model.overline}</Text>
          <Text variant="body-sm" muted className="shrink text-right">
            {model.meta}
          </Text>
        </View>
        <View className="flex-row flex-wrap items-baseline justify-between gap-space-4">
          <Count count={count} text={model.countText} />
          <Animated.View style={headStyle}>
            <Text variant={model.headSize} tone="signal">
              {model.head}
            </Text>
          </Animated.View>
        </View>
        <Progress value={count} max={capacity} label={model.progressLabel} />
        <View className="flex-row items-center justify-between gap-space-3">
          <AvatarCluster
            people={participants}
            total={count}
            max={PLAN_CLUSTER_MAX}
            open={model.openSpots}
          />
          <Text variant="body-sm" muted className="shrink">
            {place}
          </Text>
        </View>
      </View>
      {model.action === 'invite' ? (
        <Button variant="primary" block onPress={onInvite}>
          PULL SOMEONE IN
        </Button>
      ) : model.action === 'open' ? (
        <Button variant="primary" block onPress={onOpen}>
          OPEN GAME
        </Button>
      ) : model.action === 'commit' ? (
        <Button variant="commit" block committed={joined} onPress={onJoin} />
      ) : null}
    </Situation>
  );
}

type Snapshot = Omit<BodyProps, 'headIn' | 'reduced' | 'onJoin' | 'onInvite' | 'onOpen'>;

const hidden = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants' as const,
  ...(Platform.OS === 'web' ? { 'aria-hidden': true } : null),
};

/**
 * A plan gathering people to a threshold (PlanForming.md, web `function
 * PlanForming`). The object sets its own situation: forming while gathering,
 * confirmed at GAME ON, calm and dimmed (opacity-expired) once expired.
 *
 * Motion: each join plays Gather (the new avatar flies in, the segment fills,
 * the count ticks). When the last spot fills, Breakthrough: the confirmed
 * ground wipes down over the forming plan on dur-breakthrough (the web's
 * `clip-path: inset(0 0 100% 0)` → `inset(0)`), GAME ON scales in, and the
 * success haptic plays. Under reduced motion the confirmed plan cross-fades in
 * over 120ms and the headline still changes.
 *
 * Screen readers get the spec's sentence ("Football plan forming. Seven of
 * eight participants committed. One more participant needed."), then the
 * button. It never fires analytics itself.
 */
export function PlanForming({
  activity,
  count,
  capacity,
  participants = [],
  time,
  place,
  variant,
  expired,
  joined = false,
  onJoin,
  onInvite,
  onOpen,
}: PlanFormingProps) {
  const model = planModel({ activity, count, capacity, time, variant, expired });
  const { duration, easing, reduced } = useMotion('breakthrough');
  const snapshot: Snapshot = { model, count, capacity, participants, place, joined };

  // The plan as it was just before GAME ON, kept underneath while the confirmed ground takes over.
  const [prev, setPrev] = useState<Snapshot>(snapshot);
  const [under, setUnder] = useState<Snapshot | null>(null);
  if (prev.model.variant !== model.variant || prev.count !== count || prev.joined !== joined) {
    if (isBreakthrough(prev.model.variant, model.variant)) {
      // Underneath, nobody is new any more: the gather has already played.
      setUnder({ ...prev, participants: prev.participants.map((p) => ({ ...p, isNew: false })) });
    }
    else if (model.variant !== 'game-on') setUnder(null);
    setPrev(snapshot);
  }

  const t = useSharedValue(1);
  const height = useSharedValue(0);
  const breaking = under !== null;

  useLayoutEffect(() => {
    if (!breaking) return;
    t.value = 0;
    t.value = withTiming(1, reduced ? { duration: REDUCED_MOTION_FADE } : { duration, easing });
    void haptics.gameOn();
    const done = setTimeout(() => setUnder(null), (reduced ? REDUCED_MOTION_FADE : duration) + 50);
    return () => clearTimeout(done);
  }, [breaking, reduced, duration, easing, t]);

  // Clip from the bottom without moving layout: the clip box slides up by (1 − t)·H and its
  // content slides back down by the same amount, so only the top t·H of the plan shows.
  const clipBox = useAnimatedStyle(() =>
    reduced
      ? { opacity: t.value }
      : { transform: [{ translateY: -(1 - t.value) * height.value }] },
  );
  const clipContent = useAnimatedStyle(() =>
    reduced ? {} : { transform: [{ translateY: (1 - t.value) * height.value }] },
  );
  const onLayout = (e: LayoutChangeEvent) => {
    height.value = e.nativeEvent.layout.height;
  };

  return (
    <View role="article" style={styles.root}>
      {under ? (
        <View pointerEvents="none" style={styles.under} {...hidden}>
          <PlanBody {...under} reduced={reduced} />
        </View>
      ) : null}
      <Animated.View style={[styles.clip, clipBox]} onLayout={onLayout}>
        <Animated.View style={clipContent}>
          <PlanBody
            {...snapshot}
            onJoin={onJoin}
            onInvite={onInvite}
            onOpen={onOpen}
            headIn={breaking ? t : undefined}
            reduced={reduced}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'relative', alignSelf: 'stretch' },
  under: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  clip: { overflow: 'hidden' },
});
