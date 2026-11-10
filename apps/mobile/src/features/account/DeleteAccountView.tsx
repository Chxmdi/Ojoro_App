import {
  accountBlockerSentence,
  accountDeletionGoes,
  accountDeletionStays,
  formerMemberName,
  isDeleteConfirmed,
} from '@ojoro/contracts';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import {
  Button,
  DisplayText,
  Divider,
  Icon,
  Input,
  loadingProps,
  Skeleton,
  Text,
  TextButton,
  useToast,
} from '@/design-system';
import { InlineError, useIsOnline } from '@/features/profile/states';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { DeleteAccountError, useDeleteAccount, useDeletionCheck } from './data';

function Lines({ items, label }: { items: readonly string[]; label: string }) {
  return (
    <View className="gap-space-2" role="list" aria-label={label}>
      {items.map((line) => (
        <View key={line} className="flex-row gap-space-2" role="listitem">
          <Text variant="body-sm" aria-hidden>
            {'–'}
          </Text>
          <Text variant="body-sm" className="flex-1">
            {line}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** The blockers in words: the alert icon, a heavier rule, one sentence each. Never colour only. */
function Blockers({ sentences }: { sentences: string[] }) {
  return (
    <View
      className="gap-space-2 border-l-4 border-text py-space-2 pl-space-3"
      accessibilityLiveRegion="polite"
      aria-live="polite"
      testID="delete-blockers"
    >
      <View className="flex-row items-center gap-space-2">
        <Icon name="alert" size={20} label="Can't delete yet" />
        <Text variant="title-sm">{"You can't delete your account yet."}</Text>
      </View>
      {sentences.map((s) => (
        <Text key={s} variant="body-sm">
          {s}
        </Text>
      ))}
    </View>
  );
}

/**
 * DELETE ACCOUNT. Not designed (HANDOFF.md, "What isn't designed yet"): one display line, what goes and
 * what stays as Former member in plain words, what blocks it (if anything), the typed DELETE, then one
 * button. Used by Settings → Account and by the paused screen (deleting works while paused).
 */
export function DeleteAccountView({ userId, onCancel }: { userId: string; onCancel: () => void }) {
  const check = useDeletionCheck(userId);
  const remove = useDeleteAccount();
  const online = useIsOnline();
  const toast = useToast();
  const [typed, setTyped] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);

  useEffect(() => {
    track('account_delete_opened', {});
  }, []);

  const failure = remove.error;
  const failedBlockers = failure instanceof DeleteAccountError ? failure.blockers : [];
  const blockers = failedBlockers.length > 0 ? failedBlockers : (check.data?.blockers ?? []);
  const blocked = blockers.length > 0;

  const submit = () => {
    if (!isDeleteConfirmed(typed)) {
      setFieldError('Type DELETE to confirm.');
      return;
    }
    setFieldError(undefined);
    remove.mutate(undefined, {
      onSuccess: () => toast.show({ kind: 'success', message: 'Your account is deleted.' }),
    });
  };

  return (
    <View className="gap-space-6" testID="delete-account">
      <View className="gap-space-3">
        <DisplayText size="lg" accessibilityRole="header">
          DELETE ACCOUNT
        </DisplayText>
        <Text variant="body">{"This deletes your Ojoro account for good. It can't be undone."}</Text>
      </View>

      <View className="gap-space-3">
        <Divider label="WHAT GOES" />
        <Lines items={accountDeletionGoes} label="What goes" />
      </View>

      <View className="gap-space-3">
        <Divider label={`WHAT STAYS, AS ${formerMemberName.toUpperCase()}`} />
        <Text variant="body-sm">
          {`Other people keep what you did together. Your name on it becomes “${formerMemberName}”, with no photo or profile.`}
        </Text>
        <Lines items={accountDeletionStays} label="What stays" />
      </View>

      {check.isPending ? (
        <View {...loadingProps('Checking your account')}>
          <Skeleton kind="text" lines={2} />
        </View>
      ) : null}
      {blocked ? <Blockers sentences={blockers.map(accountBlockerSentence)} /> : null}
      {check.isError && !check.data ? (
        <InlineError
          message={errorMessage(ojoroErrorOf(check.error))}
          action="TRY AGAIN"
          onAction={() => void check.refetch()}
        />
      ) : null}
      {failure && failedBlockers.length === 0 ? (
        <InlineError message={errorMessage(ojoroErrorOf(failure))} testID="delete-error" />
      ) : null}

      {!blocked ? (
        <View className="gap-space-4">
          <Input
            label="Type DELETE to confirm"
            value={typed}
            onChangeText={(t) => {
              setTyped(t);
              if (fieldError) setFieldError(undefined);
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
            error={fieldError}
            onSubmitEditing={submit}
            testID="delete-confirm-input"
          />
          <Button
            block
            onPress={submit}
            loading={remove.isPending}
            disabled={!online || !check.data || !isDeleteConfirmed(typed)}
            testID="delete-account-submit"
          >
            DELETE MY ACCOUNT
          </Button>
          {!online ? (
            <Text variant="caption" muted>
              Offline. Deleting needs a connection.
            </Text>
          ) : null}
        </View>
      ) : null}
      <TextButton onPress={onCancel} testID="delete-account-cancel">
        KEEP MY ACCOUNT
      </TextButton>
    </View>
  );
}
