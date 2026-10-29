import { useEffect, useRef } from 'react';
import { AccessibilityInfo, StyleSheet, View, type TextStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useMotion } from '../motion';
import { Situation } from '../Situation';
import { useThemeColor } from '../useThemeColor';
import { DisplayText } from './DisplayText';
import {
  LIVE_ANNOUNCE_MS,
  formatValue,
  laneLabel,
  lanePct,
  raceSummary,
  shouldAnnounce,
  targetLine,
  watchingLine,
  type LiveCompetitor,
} from './LiveChallenge.logic';
import { LiveIndicator } from './LiveIndicator';
import { useOverlayReducedMotion } from './Overlay';
import { Text } from './Text';
import { VerificationBadge } from './VerificationBadge';

export {
  LIVE_ANNOUNCE_MS,
  formatValue,
  laneLabel,
  lanePct,
  raceSummary,
  shouldAnnounce,
  targetLine,
  watchingLine,
  type LiveCompetitor,
} from './LiveChallenge.logic';

export type LiveChallengeProps = {
  a: LiveCompetitor;
  b: LiveCompetitor;
  /** "5K". */
  discipline: string;
  /** "KM". */
  unit: string;
  /** The finish, in `unit`: 5. */
  target: number;
  /** The race clock as shown: "16:42". */
  elapsed?: string | undefined;
  /** How many follow it live: "212 watching". */
  watching?: number | undefined;
  testID?: string | undefined;
};

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

/**
 * Says the race aloud at most every 30s (LiveChallenge.md). Changes inside
 * the window are held and the latest one is said when it ends. Nothing is
 * said on mount: the lanes' labels already carry it.
 */
function useThrottledAnnouncement(summary: string) {
  const lastAt = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      lastAt.current = Date.now();
      return;
    }
    const say = () => {
      timer.current = null;
      lastAt.current = Date.now();
      AccessibilityInfo.announceForAccessibility(summary);
    };
    if (timer.current) clearTimeout(timer.current);
    const now = Date.now();
    if (shouldAnnounce(lastAt.current, now)) say();
    else timer.current = setTimeout(say, LIVE_ANNOUNCE_MS - (now - (lastAt.current ?? now)));
  }, [summary]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
}

/**
 * The live state of a Challenge (LiveChallenge.md, web `function
 * LiveChallenge`): two lanes racing toward the target, always on the live
 * situation (black). Each lane names its competitor and value in display
 * type, so the leader is told by numbers, never by colour. Fills ease on
 * dur-live (a scale from the left edge, so no layout moves); under reduced
 * motion they jump.
 */
export function LiveChallenge({
  a,
  b,
  discipline,
  unit,
  target,
  elapsed,
  watching,
  testID,
}: LiveChallengeProps) {
  useThrottledAnnouncement(raceSummary(a, b, unit));
  const watchers = watchingLine(watching);
  return (
    <Situation
      id="live"
      testID={testID}
      role="region"
      aria-label={`Live challenge, ${a.name} versus ${b.name}`}
      className="gap-space-5 p-space-6"
    >
      <View className="flex-row flex-wrap items-center gap-space-4">
        <LiveIndicator />
        {elapsed ? (
          <Text variant="numeric" muted accessibilityLabel={`${elapsed} elapsed`}>
            {elapsed}
          </Text>
        ) : null}
        <Text variant="label" muted className="ml-auto">
          {targetLine(discipline, target, unit)}
        </Text>
      </View>
      <Lane c={a} unit={unit} target={target} />
      <Lane c={b} unit={unit} target={target} />
      {watchers ? (
        <Text variant="body-sm" muted>
          {watchers}
        </Text>
      ) : null}
    </Situation>
  );
}

function Lane({ c, unit, target }: { c: LiveCompetitor; unit: string; target: number }) {
  const pct = lanePct(c.value, target);
  const signal = useThemeColor('signal');
  const live = useMotion('live');
  const reduced = useOverlayReducedMotion();
  const fill = useSharedValue(pct / 100);
  useEffect(() => {
    fill.value = reduced
      ? pct / 100
      : withTiming(pct / 100, { duration: live.duration, easing: live.easing });
  }, [pct, reduced, fill, live.duration, live.easing]);
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.value }] }));

  return (
    <View accessible accessibilityLabel={laneLabel(c, unit, target)} className="gap-space-2">
      <View className="flex-row flex-wrap items-end gap-space-3">
        <DisplayText size="sm">{c.name.toUpperCase()}</DisplayText>
        {c.checkedIn ? (
          <View className="mb-space-1">
            <VerificationBadge level="checked-in" />
          </View>
        ) : null}
        <View className="ml-auto flex-row items-baseline gap-space-2">
          <DisplayText size="lg" style={tabular}>
            {formatValue(c.value)}
          </DisplayText>
          <Text variant="label" muted>
            {unit}
          </Text>
        </View>
      </View>
      <View className="relative h-[16px] overflow-hidden bg-track">
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: signal, transformOrigin: 'left center' },
            fillStyle,
          ]}
        />
      </View>
    </View>
  );
}
