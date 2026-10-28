import { contrastRatio, opacity, parseColor } from '@ojoro/design-tokens';
import { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { uiFamily } from '../fonts';
import { useMotion } from '../motion';
import { useThemeColor } from '../useThemeColor';
import { focusRingStyle, isFocusVisible } from './focusRing';
import { SWITCH, knobOffset, needsMarkRing, switchWord } from './Switch.logic';
import { Text } from './Text';

export type SwitchProps = {
  value: boolean;
  onValueChange?: (value: boolean) => void;
  /** The setting, in sentence case. Visible, and the switch's accessible name. */
  label: string;
  /** What the setting does, muted under the label. Read as the hint. */
  description?: string | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
};

const isWeb = Platform.OS === 'web';

/** `.sw` word: Inter 700 11px, 0.08em tracking, line-height 1. */
const WORD_STYLE = { fontFamily: uiFamily(700), fontSize: 11, lineHeight: 12, letterSpacing: 0.88 } as const;

/**
 * Ojoro's switch (the `.sw` pattern in HostSeries, HostRequests, HostAnnounce):
 * a settings row with the label and description on the left and a drawn
 * 72×32 pill on the right. The pill says ON or OFF, so the state reads without
 * colour; ON fills it with `inverse`. The whole row is the control (role
 * switch), so the hit target is the row. The knob slides on dur-commit, and
 * jumps under reduced motion.
 */
export function Switch({ value, onValueChange, label, description, disabled, className }: SwitchProps) {
  const timing = useMotion('commit');
  const [focusVisible, setFocusVisible] = useState(false);

  const text = useThemeColor('text');
  const lineStrong = useThemeColor('line-strong');
  const inverse = useThemeColor('inverse');
  const onInverse = useThemeColor('on-inverse');
  const focus = useThemeColor('focus');
  const surface = useThemeColor('surface');
  const markRing = useThemeColor('mark-ring');
  const ringed = value && needsMarkRing(contrastRatio(inverse, surface));

  const progress = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, { duration: timing.duration, easing: timing.easing });
  }, [value, progress, timing.duration, timing.easing]);

  // The OFF pill is see-through. Fade from a clear copy of `inverse` so the fill never passes through grey.
  const { r, g, b } = parseColor(inverse);
  const clear = `rgba(${r},${g},${b},0)`;

  const off = knobOffset(false);
  const on = knobOffset(true);
  const pillStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [clear, inverse]),
    borderColor: interpolateColor(progress.value, [0, 1], [lineStrong, inverse]),
  }));
  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: off + (on - off) * progress.value }],
    backgroundColor: interpolateColor(progress.value, [0, 1], [text, onInverse]),
  }));

  const a11y = isWeb
    ? { role: 'switch' as const, 'aria-checked': value, 'aria-label': label, 'aria-disabled': !!disabled }
    : {
        accessibilityRole: 'switch' as const,
        accessibilityState: { checked: value, disabled: !!disabled },
        accessibilityLabel: label,
        accessibilityHint: description,
      };

  return (
    <Pressable
      {...a11y}
      disabled={disabled}
      onPress={() => onValueChange?.(!value)}
      onFocus={(e) => setFocusVisible(isFocusVisible(e.target, isWeb))}
      onBlur={() => setFocusVisible(false)}
      className={['flex-row items-start gap-space-4 border-b border-line py-space-4', className]
        .filter(Boolean)
        .join(' ')}
      style={[
        { minHeight: 44 },
        disabled ? { opacity: opacity['opacity-disabled'] } : null,
        isWeb ? { outlineWidth: 0 } : null,
      ]}
    >
      <View className="min-w-0 flex-1 gap-space-1">
        <Text variant="title-sm">{label}</Text>
        {description ? (
          <Text variant="body-sm" muted>
            {description}
          </Text>
        ) : null}
      </View>
      <Animated.View
        // Read once by the row; the pill is drawing only.
        {...(isWeb
          ? { 'aria-hidden': true }
          : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const })}
        style={[
          {
            width: SWITCH.width,
            height: SWITCH.height,
            borderWidth: SWITCH.border,
            borderRadius: 999,
            justifyContent: 'center',
          },
          focusVisible ? focusRingStyle(focus) : null,
          pillStyle,
        ]}
      >
        {ringed ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: -2,
              left: -2,
              right: -2,
              bottom: -2,
              borderWidth: 2,
              borderRadius: 999,
              borderColor: markRing,
            }}
          />
        ) : null}
        <Animated.View
          style={[
            { position: 'absolute', left: 0, width: SWITCH.knob, height: SWITCH.knob, borderRadius: 999 },
            knobStyle,
          ]}
        />
        <Text
          variant="label-sm"
          tone={value ? 'on-inverse' : 'text'}
          maxFontSizeMultiplier={1}
          style={[
            WORD_STYLE,
            { position: 'absolute' },
            value ? { left: SWITCH.wordInset } : { right: SWITCH.wordInset },
          ]}
        >
          {switchWord(value)}
        </Text>
      </Animated.View>
    </Pressable>
  );
}
