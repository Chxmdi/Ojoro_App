import { View } from 'react-native';

import { Situation } from '../Situation';
import { Button } from './Button';
import { Icon } from './Icon';
import { Text } from './Text';

export type GameSuggestionProps = {
  /** The plan Ojoro noticed, as a question: "FOOTBALL, SATURDAY MORNING?". */
  title: string;
  /** What Ojoro would do, with the count: "4 of you want in. Ojoro can set up the plan…". */
  body: string;
  /** Default OJORO NOTICED A PLAN. */
  overline?: string | undefined;
  /** Sets up the plan (opens Plan with the crew invited). */
  onAccept?: (() => void) | undefined;
  /** NOT NOW: hides the suggestion for you. Nothing is created. */
  onDismiss?: (() => void) | undefined;
  /** The plan is being set up: MAKE THIS A GAME waits with a spinner. */
  accepting?: boolean | undefined;
  /** Offline: both buttons wait and the note says so. */
  offline?: boolean | undefined;
  /** Couldn't set it up: the words, the alert icon and a heavier rule. */
  error?: string | undefined;
  testID?: string | undefined;
};

const NOTE = 'Only a suggestion. Nothing is created until someone taps.';
const OFFLINE_NOTE = "Offline. You can make this a game when you're back.";

/**
 * Make This a Game (CrewChat, PRD §9.11): when a plan forms in conversation,
 * Ojoro offers to set it up. Opt-in only: MAKE THIS A GAME or NOT NOW, and the
 * note says nothing is created until someone taps. It sets `forming` on its
 * own root (the plan isn't real yet), so it changes ground inside a calm chat,
 * with a 3pt `text` rule along the top.
 */
export function GameSuggestion({
  title,
  body,
  overline = 'OJORO NOTICED A PLAN',
  onAccept,
  onDismiss,
  accepting = false,
  offline = false,
  error,
  testID,
}: GameSuggestionProps) {
  return (
    <Situation
      id="forming"
      testID={testID}
      role="region"
      aria-label="Ojoro suggestion"
      className="gap-space-3 border-t-[3px] border-text p-space-5"
    >
      <Text variant="overline">{overline}</Text>
      <Text variant="display-sm" role="heading">
        {title}
      </Text>
      <Text variant="body-sm">{body}</Text>
      <View className="flex-row flex-wrap items-center gap-space-2">
        <Button variant="primary" onPress={onAccept} loading={accepting} disabled={offline}>
          MAKE THIS A GAME
        </Button>
        <Button variant="ghost" onPress={onDismiss} disabled={offline || accepting}>
          NOT NOW
        </Button>
      </View>
      {error ? (
        <View
          role="alert"
          accessible
          aria-label={`Error: ${error}`}
          className="flex-row items-start gap-space-2 border-l-4 border-text pl-space-3"
        >
          <Icon name="alert" size={20} />
          <Text variant="body-sm" className="shrink">
            {error}
          </Text>
        </View>
      ) : null}
      <Text variant="caption" muted>
        {offline ? OFFLINE_NOTE : NOTE}
      </Text>
    </Situation>
  );
}
