import { Text as RNText, View } from 'react-native';

import { uiFamily } from '../fonts';
import { haptics } from '../haptics';
import { Situation } from '../Situation';
import { useThemeColor } from '../useThemeColor';
import { Button } from './Button';
import { DisplayText } from './DisplayText';
import { Graphic } from './Graphic';
import { rematchModel } from './Rematch.logic';
import { Text } from './Text';

export { rematchModel, type RematchModel } from './Rematch.logic';

export type RematchProps = {
  /** Who asks to go again (bold in the line). */
  requester: string;
  /** Who's asked. */
  opponent: string;
  /** As it reads in the sentence: "the 5K". */
  discipline: string;
  /** "CHIMDI BY 43S". */
  lastResult: string;
  /** The requester's line: "Same loop, two weeks. Best of three?". */
  note?: string | undefined;
  /** RUN IT BACK: a new Call-Out marked REMATCH, linked to the Rivalry (heavy haptic here). */
  onAccept?: (() => void) | undefined;
  /** NOT YET: never shamed, nobody is told in words that blame. */
  onDecline?: (() => void) | undefined;
  testID?: string | undefined;
};

/**
 * The Mark in the after situation's signal. It reads the colour inside the after `Situation`, so a
 * Rematch on a live screen still draws an oxblood Mark (the hook reads the nearest situation).
 */
function SignalMark() {
  const signal = useThemeColor('signal');
  return <Graphic kind="mark" size={64} color={signal} />;
}

/**
 * The request to go again after a result (Rematch.md, web `function
 * Rematch`): the after situation on its own root, REMATCH? at display-lg so it
 * fits a phone, the Mark in signal ink. RUN IT BACK accepts (heavy haptic;
 * the owner creates a new linked Call-Out, never rewriting the old result) ·
 * NOT YET. The deprecated `from`/`to` props aren't ported (DESIGN_SYSTEM_PORT §4).
 */
export function Rematch({
  requester,
  opponent,
  discipline,
  lastResult,
  note,
  onAccept,
  onDecline,
  testID,
}: RematchProps) {
  const model = rematchModel({ requester, opponent, discipline, lastResult, note });
  const accept = () => {
    void haptics.challengeAccepted();
    onAccept?.();
  };
  return (
    <Situation id="after" testID={testID} role="region" className="gap-space-5 p-space-6">
      <View accessible accessibilityLabel={model.accessibilityLabel} className="gap-space-5">
        <Text variant="overline">{model.overline}</Text>
        <View className="flex-row items-center justify-between gap-space-3">
          <DisplayText size="lg" className="shrink">
            REMATCH?
          </DisplayText>
          <SignalMark />
        </View>
        <Text variant="body">
          <RNText style={{ fontFamily: uiFamily(700) }}>{requester}</RNText>
          {model.sentence}
        </Text>
      </View>
      <View className="flex-row flex-wrap items-center gap-space-3">
        <Button variant="primary" onPress={accept}>
          RUN IT BACK
        </Button>
        <Button variant="secondary" onPress={onDecline}>
          NOT YET
        </Button>
      </View>
    </Situation>
  );
}
