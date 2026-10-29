import { opacity } from '@ojoro/design-tokens';
import { Platform, Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { FocusRing, noBrowserOutline, useFocusVisible, usePressScale } from './pressFeedback';
import { reactionCount, reactionLabel, type Reaction } from './ReactionBar.logic';
import { Text } from './Text';

export {
  REACTIONS,
  reactionLabel,
  toggleReaction,
  type Reaction,
  type ReactionWord,
} from './ReactionBar.logic';

export type ReactionBarProps = {
  /** The reactions to show, from the fixed vocabulary (`REACTIONS`), with counts and yours. */
  reactions: readonly Reaction[];
  /**
   * Called with the reaction's label and the state it toggles to. Update
   * `reactions` straight away (`toggleReaction`) for the optimistic toggle.
   */
  onReact?: ((label: string, next: boolean) => void) | undefined;
  /** Offline or read-only: the counts stay, the buttons don't take presses. */
  disabled?: boolean | undefined;
  testID?: string | undefined;
};

/** `.oj-reaction:active { transform: scale(.94) }`: the Commit family's compress. */
const REACTION_SCALE = 0.94;
/** `.oj-reaction::after { inset: -4px 0 }`: 36pt visible, 44pt to touch. */
const HIT_SLOP = { top: 4, bottom: 4 } as const;
/** `.oj-reaction .oj-numeric { font-size: 13px }` on the numeric style's 20 line. */
const countStyle = { fontSize: 13 } as const;

/**
 * Typed reactions instead of emoji (ReactionBar.md, web `function
 * ReactionBar`): a wrapping row of 36pt pills, each the word in `label-sm` and
 * its count in tabular numerals. Yours fills with `signal`. Each is a toggle
 * button announcing "Respect, 14, you reacted". No haptic.
 */
export function ReactionBar({ reactions, onReact, disabled = false, testID }: ReactionBarProps) {
  return (
    <View
      testID={testID}
      role="group"
      aria-label="Reactions"
      className="flex-row flex-wrap gap-space-2"
    >
      {reactions.map((r) => (
        <ReactionButton
          key={r.label}
          reaction={r}
          disabled={disabled}
          onPress={onReact ? () => onReact(r.label, !r.mine) : undefined}
        />
      ))}
    </View>
  );
}

function ReactionButton({
  reaction,
  disabled,
  onPress,
}: {
  reaction: Reaction;
  disabled: boolean;
  onPress: (() => void) | undefined;
}) {
  const press = usePressScale(REACTION_SCALE);
  const focus = useFocusVisible({});
  const mine = Boolean(reaction.mine);
  const toggle = Platform.OS === 'web' ? { 'aria-pressed': mine } : { 'aria-selected': mine };
  return (
    <Pressable
      role="button"
      aria-label={reactionLabel(reaction)}
      aria-disabled={disabled || undefined}
      {...toggle}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      onPress={onPress}
      onPressIn={(event) => {
        press.pressIn();
        focus.onPressIn(event);
      }}
      onPressOut={press.pressOut}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      style={[noBrowserOutline, disabled ? { opacity: opacity['opacity-disabled'] } : null]}
    >
      <Animated.View style={press.style}>
        <View
          className={[
            'min-h-[36px] flex-row items-center gap-space-2 rounded-pill border px-space-3',
            mine ? 'border-signal bg-signal' : 'border-line-strong bg-transparent',
          ].join(' ')}
        >
          <Text variant="label-sm" tone={mine ? 'on-signal' : 'text'}>
            {reaction.label}
          </Text>
          <Text variant="numeric" tone={mine ? 'on-signal' : 'text'} style={countStyle}>
            {reactionCount(reaction.count)}
          </Text>
        </View>
        {focus.focusVisible ? <FocusRing /> : null}
      </Animated.View>
    </Pressable>
  );
}
