import { Platform, View } from 'react-native';

import { haptics } from '../haptics';
import { AvatarCluster } from './AvatarCluster';
import type { Person } from './AvatarCluster.logic';
import { Button } from './Button';
import { CREW_CLUSTER_MAX, crewMomentumModel } from './CrewMomentum.logic';
import { MomentumMeter } from './MomentumMeter';
import { Text } from './Text';

export { CREW_CLUSTER_MAX, crewMomentumModel, type CrewMomentumModel } from './CrewMomentum.logic';

export type CrewMomentumProps = {
  /** The crew's name, set in display type. */
  crew: string;
  memberCount: number;
  /** Faces for the cluster (up to five shown, then +N). */
  members?: Person[] | undefined;
  /** Sessions per week, oldest first. */
  weeks: number[];
  streak?: number | undefined;
  /** Not in `index.d.ts`. Words in place of the streak count ("COMEBACK WEEK", "FIRST WEEK"); see MomentumMeter. */
  streakText?: string | undefined;
  /** The next thing on, in words ("Football · Thu 7:30 · Jeanne-Mance"). No row without it. */
  next?: string | undefined;
  /** Not in `index.d.ts`. I'M DOWN joins the next plan directly. Without it the row has no button. */
  onDown?: (() => void) | undefined;
  /** Not in `index.d.ts`. The viewer is already in the next plan: YOU'RE DOWN. */
  joined?: boolean | undefined;
  /** Not in `index.d.ts`. The join is in flight. */
  joining?: boolean | undefined;
  testID?: string | undefined;
};

/**
 * A crew's header (CrewMomentum.md, web `function CrewMomentum`): "CREW · 14"
 * over the name, the faces, eight weeks of rhythm as plain bars with the
 * streak in words, and the next thing on with an I'M DOWN that joins it
 * directly. Analytics (`crew_viewed`, `crew_next_joined`) are the owner's.
 */
export function CrewMomentum({
  crew,
  memberCount,
  members = [],
  weeks,
  streak,
  streakText,
  next,
  onDown,
  joined,
  joining,
  testID,
}: CrewMomentumProps) {
  const model = crewMomentumModel({ crew, memberCount, weeks, next, canJoin: !!onDown, joined });
  const isJoined = model.join === 'joined';
  const pressed =
    Platform.OS === 'web' ? { 'aria-pressed': isJoined } : { 'aria-selected': isJoined };
  return (
    <View
      testID={testID}
      className="gap-space-5"
      role="group"
      accessibilityLabel={model.accessibilityLabel}
    >
      <View className="flex-row flex-wrap items-end justify-between gap-space-4">
        <View
          className="shrink"
          accessible
          accessibilityLabel={model.accessibilityLabel}
          role="heading"
        >
          <Text variant="overline">{model.overline}</Text>
          <Text variant="display-md">{crew}</Text>
        </View>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <AvatarCluster people={members} total={memberCount} max={CREW_CLUSTER_MAX} size="md" />
        </View>
      </View>
      <MomentumMeter weeks={weeks} streak={streak} streakText={streakText} label={model.rhythmLabel} />
      {next ? (
        <View className="flex-row items-center gap-space-3 border-t border-line pt-space-3">
          <Text variant="label" muted>
            NEXT
          </Text>
          <Text variant="title-sm" className="flex-1">
            {next}
          </Text>
          {model.join === 'open' || model.join === 'joined' ? (
            <Button
              variant="secondary"
              {...pressed}
              loading={!!joining}
              accessibilityLabel={isJoined ? `You're down for ${next}` : `I'm down for ${next}`}
              onPress={() => {
                if (isJoined) return;
                void haptics.imDownAccepted();
                onDown?.();
              }}
            >
              {isJoined ? "YOU'RE DOWN" : "I'M DOWN"}
            </Button>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
