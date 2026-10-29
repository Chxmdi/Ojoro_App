import { borderWidth } from '@ojoro/design-tokens';
import { Platform, View } from 'react-native';

import { haptics } from '../haptics';
import { Situation } from '../Situation';
import type { Person } from './AvatarCluster';
import { Badge } from './Badge';
import { Button } from './Button';
import { callOutModel, type CallOutStatus } from './CallOutPoster.logic';
import { DisplayText } from './DisplayText';
import { Text } from './Text';

export { CALL_OUT_STATUSES, callOutModel, type CallOutStatus } from './CallOutPoster.logic';

export type CallOutPosterProps = {
  /** Who called the other out: the top name. */
  challenger: Person;
  /** Who was called out: the bottom name, set right. */
  opponent: Person;
  /** "5K", "1V1 FOOTBALL": display-md in the foot. */
  discipline: string;
  /** "Sat 12 Oct · 9:00". */
  when?: string | undefined;
  /** PENDING (default) · ACCEPTED · COUNTERED · DECLINED, as a word in a badge. */
  status?: CallOutStatus | undefined;
  /** Show the recipient's three choices: ACCEPT · COUNTER · PASS. */
  actions?: boolean | undefined;
  /** ACCEPT: creates the Challenge Event (heavy haptic here; the owner sends `callout_accepted`). */
  onAccept?: (() => void) | undefined;
  /** COUNTER: opens the rules to change time, distance, course or format. */
  onCounter?: (() => void) | undefined;
  /** PASS: declines quietly; nobody is told in words that shame. */
  onPass?: (() => void) | undefined;
  testID?: string | undefined;
};

const hidden =
  Platform.OS === 'web'
    ? { 'aria-hidden': true as const }
    : {
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants' as const,
      };

/** `.oj-callout-rule`: a poster-weight bar, skewed like the Mark. */
function Rule() {
  return (
    <View
      {...hidden}
      className="flex-1 bg-text"
      style={{ height: borderWidth['border-poster'], transform: [{ skewX: '-24deg' }] }}
    />
  );
}

/**
 * A Call-Out (CallOutPoster.md, web `function CallOutPoster`): one person
 * challenges another. Always the live situation on its own root (black
 * ground), the two names at display-xl with VS between poster-weight rules,
 * the discipline under a hairline. With `actions`, the recipient's ACCEPT
 * (primary, heavy haptic) · COUNTER · PASS. Accepting turns it into a
 * `ChallengeEventHero`; that's the owner's swap. No stakes, ever.
 */
export function CallOutPoster({
  challenger,
  opponent,
  discipline,
  when,
  status,
  actions = false,
  onAccept,
  onCounter,
  onPass,
  testID,
}: CallOutPosterProps) {
  const model = callOutModel({ challenger, opponent, discipline, when, status });
  const accept = () => {
    void haptics.challengeAccepted();
    onAccept?.();
  };
  return (
    <Situation id="live" testID={testID} role="article" className="gap-space-5 p-space-6">
      <View accessible accessibilityLabel={model.accessibilityLabel} className="gap-space-5">
        <View className="flex-row items-center justify-between gap-space-3">
          <Text variant="overline">CALL-OUT</Text>
          <Badge tone={model.badgeTone}>{model.status}</Badge>
        </View>
        <View className="gap-space-2">
          <DisplayText size="xl">{model.challenger}</DisplayText>
          <View className="flex-row items-center gap-space-3">
            <Rule />
            <DisplayText size="sm">VS</DisplayText>
            <Rule />
          </View>
          <DisplayText size="xl" style={{ textAlign: 'right' }}>
            {model.opponent}
          </DisplayText>
        </View>
        <View className="flex-row flex-wrap items-baseline justify-between gap-space-3 border-t border-line pt-space-4">
          <DisplayText size="md">{discipline}</DisplayText>
          {when ? (
            <Text variant="body-sm" muted>
              {when}
            </Text>
          ) : null}
        </View>
      </View>
      {actions ? (
        <View className="flex-row flex-wrap items-center gap-space-3">
          <Button variant="primary" onPress={accept}>
            ACCEPT
          </Button>
          <Button variant="secondary" onPress={onCounter}>
            COUNTER
          </Button>
          <Button variant="ghost" onPress={onPass}>
            PASS
          </Button>
        </View>
      ) : null}
    </Situation>
  );
}
