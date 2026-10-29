import { useEffect, useState } from 'react';
import { View, type TextStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { useThemeColor } from '../useThemeColor';
import { Icon } from './Icon';
import { LIVE_COUNTER_LOW, useLivePulse } from './LiveIndicator';
import {
  clockLabel,
  formatClock,
  freshness,
  scoreLabel,
  scoreValue,
  type ScoreSide,
} from './LiveScoreHeader.logic';
import { Text } from './Text';

export {
  STALE_AFTER_MS,
  clockLabel,
  formatClock,
  freshness,
  scoreLabel,
  type Freshness,
  type ScoreSide,
} from './LiveScoreHeader.logic';

/**
 * The current time, ticking every `intervalMs` while mounted. Pass `fixed` to
 * freeze it (stories, tests, a game that has ended): then nothing ticks.
 */
export function useNow(fixed?: number | undefined, intervalMs = 1000): number {
  const [now, setNow] = useState(() => fixed ?? Date.now());
  useEffect(() => {
    if (fixed !== undefined) return undefined;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [fixed, intervalMs]);
  return fixed ?? now;
}

export type LiveClockProps = {
  /** When play started (epoch ms). The clock counts up from here. */
  startedAt: number;
  /** Freeze the clock at this time (epoch ms) instead of ticking. */
  now?: number | undefined;
  /** Stop the pulse (the game is paused or over). The time still shows. */
  paused?: boolean | undefined;
  testID?: string | undefined;
};

/**
 * The running clock beside LIVE (LiveActivity's header: "34:12" in `numeric`,
 * muted). Only the counter pulses, on the Live family's dur-live (opacity
 * only, so nothing moves); under reduced motion it holds still. It ticks every
 * second either way: the time is content, not motion.
 */
export function LiveClock({ startedAt, now, paused = false, testID }: LiveClockProps) {
  const current = useNow(now);
  const pulse = useLivePulse(!paused, LIVE_COUNTER_LOW);
  const elapsed = current - startedAt;
  return (
    <Animated.View
      testID={testID}
      role="timer"
      accessible
      aria-label={clockLabel(elapsed)}
      style={pulse}
    >
      <Text variant="numeric" muted>
        {formatClock(elapsed)}
      </Text>
    </Animated.View>
  );
}

export type LiveScoreHeaderProps = {
  /** "FOOTBALL · JEANNE-MANCE · 8 PLAYING". An area, never an address. */
  overline?: string | undefined;
  /** Left side: name and score ("LIGHTS", 3). */
  a: ScoreSide;
  /** Right side ("DARKS", 2). */
  b: ScoreSide;
  /** When the score was last logged (epoch ms). Drives the freshness line. */
  updatedAt: number;
  /** Who logged it: "Ade (host)". */
  loggedBy?: string | undefined;
  /** Freeze "now" (epoch ms) instead of ticking. */
  now?: number | undefined;
  /** Offline: keep the last-known score and say how old it is. */
  offline?: boolean | undefined;
  testID?: string | undefined;
};

/**
 * The live score block (LiveActivity): overline, the two sides in
 * `display-sm` over their scores in `display-hero` with tabular figures, the
 * skewed Mark between, and the freshness line with the clock icon ("Updated
 * 20 s ago · logged by Ade (host)"). A stale or offline score says so in
 * words and swaps the clock icon for the alert or offline icon. The block is
 * static; only `LiveClock` and `LiveIndicator` pulse.
 */
export function LiveScoreHeader({
  overline,
  a,
  b,
  updatedAt,
  loggedBy,
  now,
  offline = false,
  testID,
}: LiveScoreHeaderProps) {
  const current = useNow(now, 5000);
  const text = useThemeColor('text');
  const muted = useThemeColor('text-muted');
  const fresh = freshness({ updatedAt, now: current, loggedBy, offline });
  const icon = offline ? 'offline' : fresh.stale ? 'alert' : 'clock';
  return (
    <View testID={testID} className="gap-space-4">
      {overline ? <Text variant="overline">{overline}</Text> : null}
      <View accessible aria-label={scoreLabel(a, b)} className="flex-row items-end justify-between">
        <Side side={a} align="left" />
        <View
          className="self-center"
          style={{ width: 6, height: 112, backgroundColor: text, transform: [{ skewX: '-24deg' }] }}
        />
        <Side side={b} align="right" />
      </View>
      <View
        accessible
        aria-label={fresh.spoken}
        className="flex-row items-center"
        style={{ gap: 6 }}
      >
        <Icon name={icon} size={16} color={muted} />
        <Text variant="caption" muted className="shrink">
          {fresh.text}
        </Text>
      </View>
    </View>
  );
}

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

function Side({ side, align }: { side: ScoreSide; align: 'left' | 'right' }) {
  const textAlign = { textAlign: align } as const;
  return (
    <View className="shrink" style={{ alignItems: align === 'left' ? 'flex-start' : 'flex-end' }}>
      <Text variant="display-sm" style={textAlign}>
        {side.name}
      </Text>
      <Text variant="display-hero" style={[tabular, textAlign]}>
        {scoreValue(side.score)}
      </Text>
    </View>
  );
}
