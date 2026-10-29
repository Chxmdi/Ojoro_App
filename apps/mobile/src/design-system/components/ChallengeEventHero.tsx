import { useEffect, useRef } from 'react';
import { View, type TextStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { haptics } from '../haptics';
import { REDUCED_MOTION_FADE } from '../motion';
import { Situation } from '../Situation';
import type { Person } from './AvatarCluster';
import {
  heroHaptic,
  progressLabel,
  stageSpec,
  versusLabel,
  winnerHeadline,
  type ChallengeStage,
  type HeroMoment,
} from './ChallengeEventHero.logic';
import { Countdown, type CountdownProps } from './Countdown';
import { DisplayText, usePosterWidth } from './DisplayText';
import { LiveIndicator } from './LiveIndicator';
import { Text } from './Text';

export {
  CHALLENGE_STAGES,
  STAGES,
  heroHaptic,
  progressLabel,
  stageSpec,
  versusLabel,
  winnerHeadline,
  type ChallengeStage,
  type StageSituation,
  type StageSpec,
} from './ChallengeEventHero.logic';

export type Competitor = Person & {
  /** Live progress as shown: "3.4 KM". */
  progress?: string | undefined;
  /** Not in `index.d.ts`. Checked in at the start: when both are, the medium haptic plays once. */
  checkedIn?: boolean | undefined;
};

export type ChallengeEventHeroProps = {
  a: Competitor;
  b: Competitor;
  /** "5K". */
  discipline: string;
  /**
   * `accepted`/`days` → forming (names + countdown) · `today` → confirmed
   * (TODAY.) · `soon` → confirmed (ALMOST TIME.) · `live` → live (progress)
   * · `complete` → after (CHIMDI WINS.). Move forward only.
   */
  stage: ChallengeStage;
  /** Today/soon: "9:00 · Cartier monument". */
  when?: string | undefined;
  /** Accepted/days: the countdown. Pass `to` (epoch ms) so only the countdown ticks. */
  countdown?: CountdownProps | undefined;
  /** Complete: who won (default side a's name, as the web does). Verified results only. */
  winner?: string | undefined;
  /** Complete: "22:48 · 43 S AHEAD". */
  result?: string | undefined;
  testID?: string | undefined;
};

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

/**
 * Cross-fades the content in when the stage changes, within 120ms, with or
 * without reduced motion: the ground changes at once and nothing moves.
 */
function useStageFade(stage: ChallengeStage) {
  const opacity = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    opacity.value = 0;
    opacity.value = withTiming(1, { duration: REDUCED_MOTION_FADE });
  }, [stage, opacity]);
  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

/**
 * The top of a Challenge Event page (ChallengeEventHero.md, web `function
 * ChallengeEventHero`). Its situation escalates with `stage`, set on its own
 * root: forming while days away (the countdown leads), confirmed on the day
 * (TODAY. / ALMOST TIME. at the poster hero size), live once it starts (LIVE
 * and progress take over), after once verified (CHIMDI WINS.). Below it go
 * PredictionBar, CrowdSupport, then the HypePost feed.
 *
 * Haptics on a change only: medium when both competitors check in, success
 * when the result is verified. A stage change cross-fades in 120ms; nothing moves.
 */
export function ChallengeEventHero({
  a,
  b,
  discipline,
  stage,
  when,
  countdown,
  winner,
  result,
  testID,
}: ChallengeEventHeroProps) {
  const spec = stageSpec(stage);
  const [width, onLayout] = usePosterWidth();
  const fade = useStageFade(stage);

  const bothCheckedIn = !!a.checkedIn && !!b.checkedIn;
  const previous = useRef<HeroMoment | undefined>(undefined);
  useEffect(() => {
    const moment: HeroMoment = { stage, bothCheckedIn };
    const h = heroHaptic(previous.current, moment);
    previous.current = moment;
    if (h) void haptics[h]();
  }, [stage, bothCheckedIn]);

  const names = (
    <View
      accessible
      role="heading"
      accessibilityLabel={versusLabel(a.name, b.name)}
      className="gap-space-1"
    >
      {/* Plain display Text: the block is the one heading ("Chimdi versus Marcus"). */}
      <Text variant="display-xl">{a.name.toUpperCase()}</Text>
      <Text variant="display-sm" muted>
        VS
      </Text>
      <Text variant="display-xl">{b.name.toUpperCase()}</Text>
    </View>
  );

  let body;
  if (stage === 'complete') {
    body = (
      <>
        <DisplayText size="hero" posterWidth={width}>
          {winnerHeadline(winner, a.name)}
        </DisplayText>
        {result ? <Text variant="numeric">{result}</Text> : null}
      </>
    );
  } else if (stage === 'live') {
    body = (
      <>
        <View className="flex-row flex-wrap items-center gap-space-3">
          <LiveIndicator />
          <Text variant="body-sm" muted>
            {discipline}
          </Text>
        </View>
        {names}
        <View
          accessible
          accessibilityLabel={progressLabel(a, b)}
          className="flex-row justify-between gap-space-4 border-t border-line pt-space-4"
        >
          <View className="flex-1">
            <DisplayText size="lg" style={tabular}>
              {a.progress ?? ''}
            </DisplayText>
            <Text variant="label" muted>
              {a.name}
            </Text>
          </View>
          <View className="flex-1 items-end">
            <DisplayText size="lg" style={[tabular, { textAlign: 'right' }]}>
              {b.progress ?? ''}
            </DisplayText>
            <Text variant="label" muted style={{ textAlign: 'right' }}>
              {b.name}
            </Text>
          </View>
        </View>
      </>
    );
  } else {
    const counting = stage === 'days' || stage === 'accepted';
    body = (
      <>
        {spec.head ? (
          <DisplayText size="hero" posterWidth={width} className="mb-space-3">
            {spec.head}
          </DisplayText>
        ) : null}
        {names}
        <View className="flex-row flex-wrap items-end justify-between gap-space-4 border-t border-line pt-space-4">
          <DisplayText size="sm">{discipline}</DisplayText>
          {counting ? (
            <Countdown {...(countdown ?? {})} />
          ) : when ? (
            <Text variant="body-sm" muted>
              {when}
            </Text>
          ) : null}
        </View>
      </>
    );
  }

  return (
    <Situation id={spec.situation} testID={testID} role="banner" className="p-space-6">
      <Animated.View style={fade}>
        <View className="gap-space-5" onLayout={onLayout}>
          {spec.over ? <Text variant="overline">{spec.over}</Text> : null}
          {body}
        </View>
      </Animated.View>
    </Situation>
  );
}
