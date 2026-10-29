import { opacity } from '@ojoro/design-tokens';
import { Platform, Pressable, View, type TextStyle } from 'react-native';

import { FocusRing, useFocusVisible, noBrowserOutline } from './pressFeedback';
import { Text } from './Text';

export type TextButtonProps = {
  /** The word, in caps: UNDO, SKIP, EDIT. */
  children: string;
  onPress?: () => void;
  /** Use when the word alone doesn't say what it acts on ("Edit price for Drop-in"). */
  accessibilityLabel?: string;
  /** `is-on`: the word turns `text` and is underlined (a toggle that is on). */
  on?: boolean;
  disabled?: boolean;
  /** Layout classes for the outer box. */
  className?: string;
  testID?: string;
};

/**
 * `.oj-textbtn::after { inset: -6px -4px }`: the visible box is 32pt tall with
 * `space-1` sides; the touch area reaches 6pt above and below and 4pt to each
 * side, so the target is 44pt tall without the word looking like a button.
 */
const HIT_SLOP = { top: 6, bottom: 6, left: 4, right: 4 } as const;

const onStyle = {
  textDecorationLine: 'underline',
  ...(Platform.OS === 'web' ? { textUnderlineOffset: 3 } : null),
} as TextStyle;

/** A small text-only action (the `oj-textbtn` pattern): `label` type, `text-muted`, 44pt hit area. */
export function TextButton({
  children,
  onPress,
  accessibilityLabel,
  on,
  disabled = false,
  className,
  testID,
}: TextButtonProps) {
  const focus = useFocusVisible({});
  const toggle =
    on === undefined
      ? null
      : Platform.OS === 'web'
        ? { 'aria-pressed': on }
        : { 'aria-selected': on };
  return (
    <Pressable
      role="button"
      aria-label={accessibilityLabel}
      aria-disabled={disabled || undefined}
      {...toggle}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      onPress={onPress}
      onPressIn={focus.onPressIn}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      testID={testID}
      // Default to hugging its label; a caller's own self-* alignment wins.
      className={[/\bself-/.test(className ?? '') ? null : 'self-start', className]
        .filter(Boolean)
        .join(' ')}
      style={[noBrowserOutline, disabled ? { opacity: opacity['opacity-disabled'] } : null]}
    >
      <View className="min-h-[32px] justify-center px-space-1">
        <Text variant="label" muted={!on} style={on ? onStyle : undefined}>
          {children}
        </Text>
      </View>
      {focus.focusVisible ? <FocusRing shape="square" /> : null}
    </Pressable>
  );
}
