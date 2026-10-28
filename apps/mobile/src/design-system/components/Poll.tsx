import { Platform, Pressable, View } from 'react-native';

import { useThemeColor } from '../useThemeColor';
import { Icon } from './Icon';
import { pollModel, type PollOption } from './Poll.logic';
import { FocusRing, noBrowserOutline, useFocusVisible } from './pressFeedback';
import { Text } from './Text';

export { pollModel, type PollOption } from './Poll.logic';

export type PollProps = {
  /** A question, in display type ("WHAT TIME?"). */
  question: string;
  /** 2–4 options with their vote counts. */
  options: readonly PollOption[];
  /** Your vote's index: shows the results, your option checked and outlined. */
  voted?: number | undefined;
  /** When it closes, as written after "Closes" ("at 6:00", "tonight 9 PM"). */
  closes?: string | undefined;
  /** Closed: results for everyone, no check, "Closed". Not in `index.d.ts`; the spec lists the state. */
  closed?: boolean | undefined;
  onVote?: ((index: number) => void) | undefined;
  testID?: string | undefined;
};

/**
 * A crew decision in one tap (`.oj-poll`). Open: a radio group of option
 * buttons. Voted or closed: a list of results with percentage fills. The fill
 * is never the only carrier: every row writes its percentage, and your vote
 * is a check and a 2px outline, not a colour.
 */
export function Poll({ question, options, voted, closes, closed, onVote, testID }: PollProps) {
  const model = pollModel({ options, voted, closes, closed });
  return (
    <View testID={testID} className="gap-space-3">
      <View className="flex-row items-baseline justify-between gap-space-3">
        <Text variant="display-sm" role="heading" className="shrink">
          {question}
        </Text>
        {model.closesLine ? (
          <Text variant="caption" muted>
            {model.closesLine}
          </Text>
        ) : null}
      </View>
      <View
        role={model.mode === 'open' ? 'radiogroup' : 'list'}
        accessibilityLabel={question}
        className="gap-space-2"
      >
        {model.rows.map((row, i) =>
          model.mode === 'open' ? (
            <PollOptionButton
              key={i}
              label={row.label}
              {...(onVote ? { onPress: () => onVote(i) } : null)}
            />
          ) : (
            <PollResult
              key={i}
              label={row.label}
              pct={row.pct}
              mine={row.mine}
              spoken={row.accessibilityLabel}
            />
          ),
        )}
      </View>
      <Text variant="caption" muted style={{ fontVariant: ['tabular-nums'] }}>
        {model.votesLine}
      </Text>
    </View>
  );
}

function PollOptionButton({ label, onPress }: { label: string; onPress?: () => void }) {
  const focus = useFocusVisible({});
  const pressedGround = useThemeColor('surface-raised');
  // aria-checked is false on every option: an open poll has no vote yet.
  const checked =
    Platform.OS === 'web' ? { 'aria-checked': false } : { accessibilityState: { checked: false } };
  return (
    <Pressable
      role="radio"
      {...checked}
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={focus.onPressIn}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      style={noBrowserOutline}
      className="relative"
    >
      {({ pressed }) => (
        <>
          <View
            className="min-h-touch justify-center border border-line-strong px-space-4"
            style={pressed ? { backgroundColor: pressedGround } : undefined}
          >
            <Text variant="title-sm">{label}</Text>
          </View>
          {focus.focusVisible ? <FocusRing shape="square" /> : null}
        </>
      )}
    </Pressable>
  );
}

function PollResult({
  label,
  pct,
  mine,
  spoken,
}: {
  label: string;
  pct: number;
  mine: boolean;
  spoken: string;
}) {
  return (
    <View
      role="listitem"
      accessible
      accessibilityLabel={spoken}
      className={`relative min-h-touch flex-row items-center justify-between overflow-hidden px-space-4 ${
        mine ? 'border-2 border-text' : 'border border-line-strong'
      }`}
    >
      <View
        pointerEvents="none"
        className="absolute bottom-0 left-0 top-0 bg-track"
        style={{ width: `${pct}%` }}
      />
      <View className="flex-row items-center gap-space-2">
        {mine ? <Icon name="check" size={16} /> : null}
        <Text variant="title-sm">{label}</Text>
      </View>
      <Text variant="numeric">{`${pct}%`}</Text>
    </View>
  );
}
