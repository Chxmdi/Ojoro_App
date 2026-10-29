import { useEffectEvent, useLayoutEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { haptics } from '../haptics';
import { Situation } from '../Situation';
import { useThemeColor } from '../useThemeColor';
import {
  ACTIVITY_CLUSTER_MAX,
  activityObjectModel,
  isActivityBreakthrough,
  type ActivityObjectModel,
  type ActivityObjectStatus,
} from './ActivityObject.logic';
import { AvatarCluster, type Person } from './AvatarCluster';
import { Badge } from './Badge';
import { Button } from './Button';
import { useBreakthroughWipe } from './GameOnPoster';
import { Icon, type IconName } from './Icon';
import { LiveIndicator } from './LiveIndicator';
import { Progress } from './Progress';
import { Text } from './Text';

export {
  activityObjectModel,
  ACTIVITY_OBJECT_STATUSES,
  type ActivityObjectStatus,
} from './ActivityObject.logic';

export type ActivityObjectProps = {
  activity: string;
  /** Over the time, as a label: "TONIGHT", "THU". */
  day: string;
  /** In display type: "7:30". */
  time: string;
  /** An area, never an address. */
  place: string;
  /** "1.2 km", after the place. */
  distance?: string | undefined;
  /** "Mixed level". */
  level?: string | undefined;
  count: number;
  capacity: number;
  /** The people in. The one who just joined has `isNew` and gathers in. */
  people?: Person[] | undefined;
  /** `forming` (calm ground, count badge, I'M DOWN) · `confirmed` (GAME ON) · `live` (LIVE). Default `forming`. */
  status?: ActivityObjectStatus | undefined;
  /** You're in: the join button reads YOU'RE DOWN. */
  joined?: boolean | undefined;
  /** `false` on the activity's own page hides DETAILS. */
  details?: boolean | undefined;
  /** I'M DOWN. Plays the light haptic; the owner flips `joined` and the count. No analytics here. */
  onJoin?: (() => void) | undefined;
  /** DETAILS. */
  onOpen?: (() => void) | undefined;
};

const hidden = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants' as const,
  ...(Platform.OS === 'web' ? { 'aria-hidden': true } : null),
};

function MetaItem({ icon, text }: { icon: IconName; text: string }) {
  const muted = useThemeColor('text-muted');
  return (
    <View className="shrink flex-row items-center gap-space-1">
      <Icon name={icon} size={16} color={muted} />
      <Text variant="body-sm" muted className="shrink">
        {text}
      </Text>
    </View>
  );
}

type BodyProps = {
  model: ActivityObjectModel;
  day: string;
  time: string;
  activity: string;
  level?: string | undefined;
  count: number;
  capacity: number;
  people: Person[];
  details: boolean;
  onJoin?: (() => void) | undefined;
  onOpen?: (() => void) | undefined;
};

/** `.oj-activity`: row, gap 20, padding 20, a 2px rule in `text` on top. */
function ActivityBody({
  model,
  day,
  time,
  activity,
  level,
  count,
  capacity,
  people,
  details,
  onJoin,
  onOpen,
}: BodyProps) {
  const joined = model.join === 'joined';
  // RN has no aria-pressed: selected on native, aria-pressed on web.
  const pressed = Platform.OS === 'web' ? { 'aria-pressed': joined } : { 'aria-selected': joined };
  return (
    <Situation
      id={model.situation}
      className="flex-row gap-space-5 border-t-2 border-text p-space-5"
    >
      {/* The one element screen readers stop on, first; the rest of the facts are inside its label. */}
      <View
        accessible
        accessibilityLabel={model.accessibilityLabel}
        className="min-w-[96px] gap-space-1"
      >
        <Text variant="label" muted>
          {day}
        </Text>
        <Text variant="display-lg" style={{ fontVariant: ['tabular-nums'] }}>
          {time}
        </Text>
      </View>
      <View className="min-w-0 flex-1 gap-space-3">
        <View className="gap-space-3" {...hidden}>
          <View className="flex-row flex-wrap items-center justify-between gap-space-3">
            <Text variant="title">{activity}</Text>
            {/* Badge sets self-start; the wrapper lets the row centre it on the title, as `.oj-row` does. */}
            <View>
              {model.tag.kind === 'live' ? (
                <LiveIndicator decorative />
              ) : (
                <Badge tone={model.tag.tone}>{model.tag.text}</Badge>
              )}
            </View>
          </View>
          <View className="flex-row flex-wrap gap-space-4">
            <MetaItem icon="pin" text={model.where} />
            {level ? <MetaItem icon="people" text={level} /> : null}
          </View>
          <Progress value={count} max={capacity} />
        </View>
        <View className="flex-row flex-wrap items-center justify-between gap-space-3">
          <View {...hidden}>
            <AvatarCluster
              people={people}
              total={count}
              max={ACTIVITY_CLUSTER_MAX}
              open={model.openSpots}
            />
          </View>
          {details || model.join !== 'none' ? (
            <View className="max-w-full flex-row flex-wrap items-center gap-space-3">
              {details ? (
                <Button variant="ghost" onPress={onOpen}>
                  DETAILS
                </Button>
              ) : null}
              {model.join !== 'none' ? (
                <Button
                  variant="primary"
                  {...pressed}
                  onPress={() => {
                    if (!joined) void haptics.imDownAccepted();
                    onJoin?.();
                  }}
                >
                  {joined ? "YOU'RE DOWN" : "I'M DOWN"}
                </Button>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </Situation>
  );
}

type Snapshot = Omit<BodyProps, 'onJoin' | 'onOpen'> & { status: ActivityObjectStatus };

/**
 * The full activity object (ActivityObject.md, web `function ActivityObject`):
 * when in display type, what, where, who, how full, and what you can do. It
 * sets its own situation: calm while forming, confirmed at GAME ON, live
 * while it's on.
 *
 * Motion: a join plays Gather (the avatar flies in, a segment fills). When a
 * forming activity turns confirmed, Breakthrough: the confirmed ground wipes
 * down over the forming one, with the success haptic. Reduced motion: a 120ms
 * cross-fade, and the badge still changes to GAME ON.
 *
 * Full while forming: FULL instead of the count, and no I'M DOWN for those not
 * in (YOU'RE DOWN stays for those in).
 */
export function ActivityObject({
  activity,
  day,
  time,
  place,
  distance,
  level,
  count,
  capacity,
  people = [],
  status = 'forming',
  joined = false,
  details = true,
  onJoin,
  onOpen,
}: ActivityObjectProps) {
  const model = activityObjectModel({
    activity,
    day,
    time,
    place,
    distance,
    count,
    capacity,
    status,
    joined,
  });
  const snapshot: Snapshot = {
    model,
    day,
    time,
    activity,
    level,
    count,
    capacity,
    people,
    details,
    status,
  };

  // The object as it was just before GAME ON, kept underneath while the confirmed ground takes over.
  const [prev, setPrev] = useState<Snapshot>(snapshot);
  const [under, setUnder] = useState<Snapshot | null>(null);
  if (prev.status !== status || prev.count !== count || prev.model.join !== model.join) {
    if (isActivityBreakthrough(prev.status, status)) {
      setUnder({ ...prev, people: prev.people.map((p) => ({ ...p, isNew: false })) });
    } else if (status !== 'confirmed') setUnder(null);
    setPrev(snapshot);
  }

  const wipe = useBreakthroughWipe(false);
  const breaking = under !== null;
  // Plays once per breakthrough, reading the current wipe when it starts.
  const playBreakthrough = useEffectEvent(() => {
    wipe.play();
    return setTimeout(() => setUnder(null), wipe.duration + (wipe.reduced ? 170 : 50));
  });
  useLayoutEffect(() => {
    if (!breaking) return undefined;
    const done = playBreakthrough();
    return () => clearTimeout(done);
  }, [breaking]);

  return (
    <View role="article" style={styles.root}>
      {under ? (
        <View pointerEvents="none" style={styles.under} {...hidden}>
          <ActivityBody {...under} />
        </View>
      ) : null}
      <Animated.View style={[styles.clip, wipe.box]} onLayout={wipe.onLayout}>
        <Animated.View style={wipe.content}>
          <ActivityBody {...snapshot} onJoin={onJoin} onOpen={onOpen} />
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
