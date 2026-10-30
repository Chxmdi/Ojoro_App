import type { Href } from 'expo-router';
import { View } from 'react-native';

import { Button } from './Button';
import { Divider } from './Divider';
import { goalHeadline } from './Goal.logic';
import { Text } from './Text';
import { TextButton } from './TextButton';

export { goalHeadline, goalLabel, GOAL_MAX_LENGTH } from './Goal.logic';

export type GoalNextStep = {
  /** "Tempo run · Thu 6:30 · Plateau Run Club". */
  title: string;
  /** Default I'M DOWN. */
  actionLabel?: string | undefined;
  href?: Href | undefined;
  onPress?: (() => void) | undefined;
};

export type GoalProps = {
  /** The goal in the person's words ("Sub-22 5K by December"). Set in display caps with a full stop. Null or empty: the empty state. */
  title?: string | null | undefined;
  /** Progress in words, muted ("Best so far: 23:05. The Call-Out on Saturday is your next real test."). */
  body?: string | undefined;
  /** A real activity that moves the goal on (PRD §9.17). */
  nextStep?: GoalNextStep | null | undefined;
  /** The overline set into the rule. Default GOAL. */
  label?: string | undefined;
  /** Your own goal: SET A GOAL (empty) or CHANGE (set). Omit on someone else's profile. */
  onEdit?: (() => void) | undefined;
  /** The empty state's line. Default "One goal at a time. Ojoro suggests games that move it on." */
  emptyText?: string | undefined;
  testID?: string | undefined;
};

/** GOAL → "Goal": the section's name, like the prototype's `aria-label`. */
function sectionName(label: string): string {
  const l = label.toLowerCase();
  return l.charAt(0).toUpperCase() + l.slice(1);
}

/**
 * You.png's GOAL block: the rule with GOAL, the goal in `display-sm`, a muted
 * progress line, and a NEXT STEP panel on `surface-raised` with a real plan
 * and I'M DOWN. One goal at a time. Empty, with `onEdit`, it offers SET A GOAL.
 */
export function Goal({
  title,
  body,
  nextStep,
  label = 'GOAL',
  onEdit,
  emptyText = 'One goal at a time. Ojoro suggests games that move it on.',
  testID,
}: GoalProps) {
  const headline = goalHeadline(title);
  return (
    <View className="gap-space-3" role="region" aria-label={sectionName(label)} testID={testID}>
      <Divider label={label} />
      {headline ? (
        <>
          <Text variant="display-sm" role="heading">
            {headline}
          </Text>
          {body ? (
            <Text variant="body-sm" muted>
              {body}
            </Text>
          ) : null}
          {nextStep ? (
            <View className="flex-row items-center justify-between gap-space-3 bg-surface-raised p-space-4">
              <View className="flex-1">
                <Text variant="label" muted>
                  NEXT STEP
                </Text>
                <Text variant="title-sm">{nextStep.title}</Text>
              </View>
              <Button
                variant="secondary"
                compact
                {...(nextStep.href ? { href: nextStep.href } : null)}
                onPress={nextStep.onPress}
                accessibilityLabel={`${nextStep.actionLabel ?? "I'M DOWN"}: ${nextStep.title}`}
              >
                {nextStep.actionLabel ?? "I'M DOWN"}
              </Button>
            </View>
          ) : null}
          {onEdit ? (
            <View className="flex-row">
              <TextButton onPress={onEdit} accessibilityLabel="Change your goal">
                CHANGE
              </TextButton>
            </View>
          ) : null}
        </>
      ) : (
        <>
          <Text variant="body-sm" muted>
            {emptyText}
          </Text>
          {onEdit ? (
            <View className="flex-row">
              <Button variant="secondary" onPress={onEdit}>
                SET A GOAL
              </Button>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}
