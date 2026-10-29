import { forwardRef } from 'react';
import { View, type TextInput } from 'react-native';

import { canSend, composerHint } from './ChatMessage.logic';
import { IconButton } from './IconButton';
import { Input } from './Input';

export type ChatComposerProps = {
  /** The text in the field (controlled). */
  value: string;
  onChangeText: (text: string) => void;
  /** Called with the trimmed text. Clear `value` once it's queued. */
  onSend: (text: string) => void;
  /** "Message Thursday FC". */
  placeholder?: string | undefined;
  /** The field's label. Default MESSAGE. */
  label?: string | undefined;
  /** Offline: you can keep typing; send waits, and the hint says why. */
  offline?: boolean | undefined;
  /** Can't post here at all (left the crew, chat closed): the field greys out. */
  disabled?: boolean | undefined;
  /** Why it's disabled, in one sentence, shown as the hint. */
  disabledReason?: string | undefined;
  /** A send is in flight: the button waits so it can't double-send. */
  sending?: boolean | undefined;
  /** A send error to show under the field (alert icon, heavier rule, "Error: "). */
  error?: string | undefined;
  maxLength?: number | undefined;
  testID?: string | undefined;
};

/** One line to start (44pt like every field), growing to about five lines. */
const FIELD_STYLE = { minHeight: 44, maxHeight: 24 * 5 + 24 } as const;

/**
 * The chat composer (CrewChat's footer): a `line` rule above, the MESSAGE
 * field filling the row, and the solid 44pt send button beside the well (24pt
 * down: the label's 16 plus its 8 gap), so a hint or error under the field
 * never pushes it out of line. Send is disabled while the field is empty,
 * offline, disabled or already sending; the hint says why in words.
 * The screen adds the bottom safe-area inset.
 */
export const ChatComposer = forwardRef<TextInput, ChatComposerProps>(function ChatComposer(
  {
    value,
    onChangeText,
    onSend,
    placeholder,
    label = 'Message',
    offline = false,
    disabled = false,
    disabledReason,
    sending = false,
    error,
    maxLength,
    testID,
  },
  ref,
) {
  const ready = canSend(value, { offline, disabled, sending });
  const hint = composerHint({ offline, disabledReason: disabled ? disabledReason : undefined });
  const send = () => {
    if (ready) onSend(value.trim());
  };
  return (
    <View
      testID={testID}
      className="flex-row items-start gap-space-2 border-t border-line pb-space-3 pl-space-5 pr-space-3 pt-space-3"
    >
      <View className="min-w-0 flex-1">
        <Input
          ref={ref}
          label={label}
          placeholder={placeholder}
          value={value}
          onChangeText={onChangeText}
          multiline
          numberOfLines={1}
          disabled={disabled}
          hint={hint}
          error={error}
          maxLength={maxLength}
          submitBehavior="newline"
          style={FIELD_STYLE}
        />
      </View>
      <IconButton
        icon="forward"
        label={sending ? 'Sending' : 'Send'}
        variant="solid"
        disabled={!ready}
        onPress={send}
        {...(testID ? { testID: `${testID}-send` } : null)}
        className="mt-space-6"
      />
    </View>
  );
});
