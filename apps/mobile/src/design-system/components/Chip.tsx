import { opacity } from '@ojoro/design-tokens';
import { Platform, Pressable, View, type TextStyle } from 'react-native';
import type { ReactNode } from 'react';

import { uiFamily } from '../fonts';
import { useThemeColor } from '../useThemeColor';
import { Check, FocusRing, useFocusVisible, noBrowserOutline } from './pressFeedback';
import { Text } from './Text';

export type ChipProps = {
  /** Selected: inverse fill, inverse border and a check, so selection never rests on fill alone. */
  selected?: boolean;
  onPress?: () => void;
  /** The label, in sentence case (sports, times, crews). */
  children?: ReactNode;
  disabled?: boolean;
  /** Layout classes for the outer box. */
  className?: string;
  testID?: string;
};

/** `.oj-chip`: Inter 600, 14/20. */
const chipLabel: TextStyle = { fontFamily: uiFamily(600), fontSize: 14, lineHeight: 20 };

/**
 * Pill filter and choice control. Chips never shrink or wrap their label; a row
 * that runs out of room scrolls sideways (put chips in a horizontal ScrollView).
 */
export function Chip({
  selected = false,
  onPress,
  children,
  disabled,
  className,
  testID,
}: ChipProps) {
  const onInverse = useThemeColor('on-inverse');
  const focus = useFocusVisible({});
  // aria-pressed on the web; RN has none, so selected on native (porting guide §4).
  const state =
    Platform.OS === 'web' ? { 'aria-pressed': selected } : { 'aria-selected': selected };
  return (
    <Pressable
      role="button"
      {...state}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onPress={onPress}
      onPressIn={focus.onPressIn}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      testID={testID}
      className={['shrink-0 self-start', className].filter(Boolean).join(' ')}
      style={[noBrowserOutline, disabled ? { opacity: opacity['opacity-disabled'] } : null]}
    >
      <View
        className={`min-h-touch flex-row items-center gap-space-1 rounded-pill border px-space-4 ${
          selected ? 'border-inverse bg-inverse' : 'border-line-strong bg-transparent'
        }`}
      >
        {selected ? <Check color={onInverse} /> : null}
        {typeof children === 'string' || typeof children === 'number' ? (
          <Text variant="body-sm" tone={selected ? 'on-inverse' : 'text'} style={chipLabel}>
            {children}
          </Text>
        ) : (
          children
        )}
      </View>
      {focus.focusVisible ? <FocusRing /> : null}
    </Pressable>
  );
}
