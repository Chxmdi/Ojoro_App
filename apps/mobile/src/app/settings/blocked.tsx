import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';

import {
  DisplayText,
  IconButton,
  loadingProps,
  Screen,
  Skeleton,
  Strip,
  StripList,
  Text,
  TextButton,
  useToast,
} from '@/design-system';
import { useMyBlocks } from '@/features/profile/data';
import { InlineError, OfflineNote, useIsOnline } from '@/features/profile/states';
import { firstName } from '@/features/safety/reasons';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf, rpc } from '@/lib/rpc';

/** Settings → Blocked people. Not designed: a strip per person with UNBLOCK (`my_blocks`). */
export default function BlockedPeople() {
  const blocks = useMyBlocks();
  const online = useIsOnline();
  const queryClient = useQueryClient();
  const toast = useToast();
  const unblock = useMutation({
    mutationFn: (id: string) => rpc('unblock_user', { p_user_id: id }),
    onSuccess: () => {
      track('user_unblocked', { from: 'settings' });
      void queryClient.invalidateQueries();
      toast.show({ kind: 'success', message: 'Unblocked.' });
    },
    onError: (e) => toast.show({ kind: 'error', message: errorMessage(ojoroErrorOf(e)) }),
  });

  return (
    <Screen situation="calm" scroll gutter={false}>
      <View className="flex-row items-center pl-space-2 pt-space-2">
        <IconButton
          icon="back"
          label="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/you'))}
        />
      </View>
      <View className="gap-space-6 px-space-5 pb-space-10 pt-space-4">
        <View className="gap-space-3">
          <DisplayText size="lg" accessibilityRole="header">
            BLOCKED PEOPLE
          </DisplayText>
          <Text variant="body">
            {"You and they don't see each other anywhere on Ojoro. They aren't told."}
          </Text>
        </View>
        {!online && blocks.data ? (
          <OfflineNote dataUpdatedAt={blocks.dataUpdatedAt} what="this list" extra="Unblocking needs a connection." />
        ) : null}
        {blocks.data ? (
          blocks.data.length === 0 ? (
            <Text variant="body-sm" muted>
              {"You haven't blocked anyone."}
            </Text>
          ) : (
            <StripList>
              {blocks.data.map((b) => (
                <Strip
                  key={b.user_id}
                  title={b.display_name}
                  titleVariant="title-sm"
                  accessible={false}
                  trailing={
                    <TextButton
                      onPress={() => unblock.mutate(b.user_id)}
                      disabled={!online || unblock.isPending}
                      accessibilityLabel={`Unblock ${firstName(b.display_name)}`}
                    >
                      UNBLOCK
                    </TextButton>
                  }
                />
              ))}
            </StripList>
          )
        ) : blocks.isError ? (
          <InlineError
            message={errorMessage(ojoroErrorOf(blocks.error))}
            action="TRY AGAIN"
            onAction={() => void blocks.refetch()}
          />
        ) : (
          <View {...loadingProps('Loading blocked people')}>
            <Skeleton kind="strip" />
          </View>
        )}
      </View>
    </Screen>
  );
}
