import type { AppealKind } from '@ojoro/contracts';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Chip, Input, Sheet, Text, useToast } from '@/design-system';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { InlineError } from '../profile/states';
import { appealMessageProblem } from './accountStatus';
import { useSubmitAppeal } from './useAccountStatus';

export type AppealChoice = { id: string; label: string };

export type AppealSheetProps = {
  visible: boolean;
  onClose: () => void;
  kind: AppealKind;
  /** The pause, hidden content or game being appealed. With `choices`, the first one until picked. */
  subjectId?: string | undefined;
  /** Several things to pick from (show-up: the games counted as missed). */
  choices?: readonly AppealChoice[] | undefined;
  title: string;
  /** One line under the title saying what Ojoro will look at. */
  intro: string;
};

/**
 * Ask Ojoro to look again (docs/TRUST_CONTRACT.md "Appeals"). Not designed (HANDOFF.md, "What isn't
 * designed yet"): built from Sheet, Chip and Input like the report sheet. One message, SEND.
 */
export function AppealSheet({
  visible,
  onClose,
  kind,
  subjectId,
  choices,
  title,
  intro,
}: AppealSheetProps) {
  const toast = useToast();
  const submit = useSubmitAppeal(kind);
  const [picked, setPicked] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setPicked(null);
      setMessage('');
      setError(null);
    }
  }

  const subject = picked ?? subjectId ?? choices?.[0]?.id ?? null;

  const send = () => {
    const problem = appealMessageProblem(message);
    if (problem || !subject) {
      setError(problem ?? 'Pick what you want us to look at.');
      return;
    }
    setError(null);
    submit.mutate(
      { subjectId: subject, message },
      {
        onSuccess: () => {
          toast.show({
            kind: 'success',
            message: 'Appeal sent. We will look at it and tell you here.',
          });
          onClose();
        },
        onError: (thrown) => setError(errorMessage(ojoroErrorOf(thrown))),
      },
    );
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      actions={
        <Button block onPress={send} loading={submit.isPending} testID="appeal-send">
          SEND
        </Button>
      }
    >
      <View className="gap-space-4">
        <Text variant="body" muted>
          {intro}
        </Text>
        {choices && choices.length > 0 ? (
          <View className="flex-row flex-wrap gap-space-2" accessibilityRole="radiogroup">
            {choices.map((c) => (
              <Chip
                key={c.id}
                selected={subject === c.id}
                onPress={() => setPicked(c.id)}
                testID={`appeal-choice-${c.id}`}
              >
                {c.label}
              </Chip>
            ))}
          </View>
        ) : null}
        <Input
          label="What happened"
          multiline
          value={message}
          onChangeText={setMessage}
          maxLength={1000}
          hint="Ojoro staff read every appeal."
          testID="appeal-message"
        />
        {error ? <InlineError message={error} /> : null}
      </View>
    </Sheet>
  );
}
