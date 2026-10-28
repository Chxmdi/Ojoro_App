import { opacity } from '@ojoro/design-tokens';
import { useState } from 'react';
import { Platform, Pressable, View, type AccessibilityActionEvent } from 'react-native';

import { uiFamily } from '../fonts';
import { useThemeColor } from '../useThemeColor';
import { focusRingStyle, isFocusVisible } from './focusRing';
import { canDecrease, canIncrease, clamp, stepValue, stepperText } from './Stepper.logic';
import { Text } from './Text';

export type StepperProps = {
  value: number;
  onChange?: (value: number) => void;
  min?: number | undefined;
  max?: number | undefined;
  /** How far one press moves. Default 1. */
  step?: number | undefined;
  /** The thing being counted, in sentence case ("Players", "Capacity"). Visible, and used to name the buttons. */
  label: string;
  /** A muted line under the label ("7 a side. Ojoro balances teams at check-in."). */
  hint?: string | undefined;
  /** What is shown for a value, e.g. `(n) => '$' + n`. Default: the number. */
  format?: ((value: number) => string) | undefined;
  className?: string | undefined;
};

const isWeb = Platform.OS === 'web';

/** `.step` glyph: Inter 600 22/1. */
const GLYPH_STYLE = { fontFamily: uiFamily(600), fontSize: 22, lineHeight: 24 } as const;

function StepButton({
  glyph,
  name,
  reason,
  enabled,
  onPress,
}: {
  glyph: string;
  name: string;
  reason?: string | undefined;
  enabled: boolean;
  onPress: () => void;
}) {
  const [focusVisible, setFocusVisible] = useState(false);
  const focus = useThemeColor('focus');
  const a11y = isWeb
    ? // At a bound the spinbutton's value text says "10, the minimum"; react-native-web has no hint prop.
      { role: 'button' as const, 'aria-label': name, 'aria-disabled': !enabled }
    : {
        accessibilityRole: 'button' as const,
        accessibilityLabel: name,
        accessibilityHint: reason,
        accessibilityState: { disabled: !enabled },
      };
  return (
    <Pressable
      {...a11y}
      disabled={!enabled}
      onPress={onPress}
      onFocus={(e) => setFocusVisible(isFocusVisible(e.target, isWeb))}
      onBlur={() => setFocusVisible(false)}
      className="size-touch items-center justify-center rounded-pill border border-line-strong"
      style={[
        !enabled ? { opacity: opacity['opacity-disabled'] } : null,
        focusVisible ? focusRingStyle(focus) : isWeb ? { outlineWidth: 0 } : null,
      ]}
    >
      <Text variant="title-sm" style={GLYPH_STYLE} maxFontSizeMultiplier={1}>
        {glyph}
      </Text>
    </Pressable>
  );
}

/**
 * Ojoro's stepper (the `.step` pattern in HostSeries): the label and hint on
 * the left, then − value +. The buttons are 44pt circles named from `label`
 * ("Decrease capacity"); at a bound the button dims and says why. The value is
 * `display-sm` with tabular numerals, and is the adjustable element for screen
 * readers (swipe up or down to change it).
 */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  label,
  hint,
  format = String,
  className,
}: StepperProps) {
  const current = clamp(value, min, max);
  const words = stepperText(label, current, min, max, format);
  const lower = canDecrease(current, min);
  const higher = canIncrease(current, max);
  const bounds = { min, max, step };
  const go = (direction: 1 | -1) => {
    const next = stepValue(current, direction, bounds);
    if (next !== current) onChange?.(next);
  };
  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment') go(1);
    if (e.nativeEvent.actionName === 'decrement') go(-1);
  };

  const valueA11y = isWeb
    ? {
        role: 'spinbutton' as const,
        'aria-label': label,
        'aria-valuemin': min,
        'aria-valuemax': max,
        'aria-valuenow': current,
        'aria-valuetext': words.value,
        'aria-live': 'polite' as const,
      }
    : {
        accessible: true,
        accessibilityRole: 'adjustable' as const,
        accessibilityLabel: label,
        accessibilityValue: { min, max, now: current, text: words.value },
        accessibilityActions: [{ name: 'increment' as const }, { name: 'decrement' as const }],
        onAccessibilityAction: onAction,
        accessibilityLiveRegion: 'polite' as const,
      };

  return (
    <View className={['flex-row items-center gap-space-4', className].filter(Boolean).join(' ')}>
      <View className="min-w-0 flex-1" style={{ gap: 2 }}>
        <Text
          variant="title-sm"
          // The adjustable value carries the label; don't read it twice.
          {...(isWeb ? { 'aria-hidden': true } : { accessible: false, importantForAccessibility: 'no' as const })}
        >
          {label}
        </Text>
        {hint ? (
          <Text variant="body-sm" muted>
            {hint}
          </Text>
        ) : null}
      </View>
      <StepButton glyph="−" name={words.decrease} reason={words.decreaseReason} enabled={lower} onPress={() => go(-1)} />
      <View {...valueA11y} style={{ minWidth: 40 }} className="items-center">
        <Text variant="display-sm" style={{ fontVariant: ['tabular-nums'], textAlign: 'center' }}>
          {format(current)}
        </Text>
      </View>
      <StepButton glyph="+" name={words.increase} reason={words.increaseReason} enabled={higher} onPress={() => go(1)} />
    </View>
  );
}
