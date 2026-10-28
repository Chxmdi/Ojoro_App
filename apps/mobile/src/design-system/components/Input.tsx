import { opacity } from '@ojoro/design-tokens';
import { forwardRef, useId, useImperativeHandle, useRef, useState } from 'react';
import { Platform, TextInput, View, type TextInputProps } from 'react-native';

import { uiFamily } from '../fonts';
import { useThemeColor } from '../useThemeColor';
import { focusRingStyle } from './focusRing';
import { Icon, type IconName } from './Icon';
import { ERROR_PREFIX, MULTILINE_MIN_HEIGHT, inputMessage, inputPadding, inputRule } from './Input.logic';
import { Text } from './Text';

export type InputProps = TextInputProps & {
  /** Always visible above the well, never placeholder-only. Shown uppercase. */
  label: string;
  /** Muted line under the well. Replaced by `error` when both are set. */
  hint?: string | undefined;
  /** Turns the rule into a 4px `text` rule and shows the alert icon and "Error: " in words. Never red. */
  error?: string | undefined;
  /** Three-row text area that grows. */
  multiline?: boolean | undefined;
  /** A 20px line icon at the left of the well (pin for places, clock for times). */
  icon?: IconName | undefined;
  /** Greys the whole field at the disabled opacity and stops editing. */
  disabled?: boolean | undefined;
  className?: string | undefined;
};

const isWeb = Platform.OS === 'web';

/**
 * A text field (Input.md, web `function Input`): uppercase label above, a
 * `surface-sunk` well at radius-xs (top corners), at least 44 tall, with a 2px
 * bottom rule. Focus turns the rule `signal` and shows the 2px focus ring;
 * error makes it a 4px `text` rule with the alert icon and "Error: " prefix.
 * The hint or error is linked to the field for screen readers.
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, hint, error, multiline, icon, disabled, editable, className, style, onFocus, onBlur, ...rest },
  ref,
) {
  const id = useId();
  const messageId = `oj-in-${id.replace(/[^a-zA-Z0-9_-]/g, '')}-hint`;
  const inner = useRef<TextInput>(null);
  useImperativeHandle(ref, () => inner.current as TextInput);
  const [focused, setFocused] = useState(false);

  const isDisabled = disabled || editable === false;
  const message = inputMessage(hint, error);
  const rule = inputRule({ focused, error: !!error });

  const surfaceSunk = useThemeColor('surface-sunk');
  const text = useThemeColor('text');
  const muted = useThemeColor('text-muted');
  const ruleColor = useThemeColor(rule.color);
  const focus = useThemeColor('focus');

  // Web links the message by id (aria-describedby); native reads it as the hint.
  const a11y = isWeb
    ? {
        'aria-label': label,
        'aria-invalid': !!error,
        'aria-disabled': !!isDisabled,
        ...(message ? { 'aria-describedby': messageId } : null),
      }
    : {
        accessibilityLabel: label,
        accessibilityHint: message?.spoken,
        accessibilityState: { disabled: isDisabled },
      };

  return (
    <View
      className={['gap-space-2', className].filter(Boolean).join(' ')}
      style={isDisabled ? { opacity: opacity['opacity-disabled'] } : undefined}
    >
      <Text
        variant="label"
        onPress={isDisabled ? undefined : () => inner.current?.focus()}
        // The field carries the label itself; don't read it twice.
        {...(isWeb ? { 'aria-hidden': true } : { importantForAccessibility: 'no' as const, accessible: false })}
      >
        {label}
      </Text>
      <View className="justify-center">
        <TextInput
          ref={inner}
          multiline={multiline}
          numberOfLines={multiline ? 3 : undefined}
          textAlignVertical={multiline ? 'top' : 'center'}
          editable={!isDisabled}
          placeholderTextColor={muted}
          cursorColor={text}
          selectionColor={text}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...a11y}
          {...rest}
          style={[
            {
              minHeight: multiline ? MULTILINE_MIN_HEIGHT : 44,
              paddingVertical: 12,
              ...inputPadding(!!icon),
              fontFamily: uiFamily(400),
              fontSize: 16,
              lineHeight: 24,
              color: text,
              backgroundColor: surfaceSunk,
              borderBottomWidth: rule.width,
              borderBottomColor: ruleColor,
              borderTopLeftRadius: 2,
              borderTopRightRadius: 2,
            },
            focused ? focusRingStyle(focus) : isWeb ? { outlineWidth: 0 } : null,
            style,
          ]}
        />
        {icon ? (
          <View pointerEvents="none" className="absolute" style={{ left: 12 }}>
            <Icon name={icon} size={20} color={muted} />
          </View>
        ) : null}
      </View>
      {message ? (
        <View nativeID={messageId} className="flex-row items-start gap-space-1">
          {message.kind === 'error' ? (
            <Icon name="alert" size={16} />
          ) : null}
          <Text variant="body-sm" muted={message.kind === 'hint'} className="shrink">
            {message.kind === 'error' ? <Text variant="body-sm" style={{ fontFamily: uiFamily(700) }}>{ERROR_PREFIX}</Text> : null}
            {message.text}
          </Text>
        </View>
      ) : null}
    </View>
  );
});
