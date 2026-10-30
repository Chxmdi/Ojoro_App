import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { DisplayText, IconButton, loadingProps, Screen, Skeleton, Text, useToast } from '@/design-system';
import type { Privacy, PrivacyPart, Visibility } from '@/features/onboarding/draft';
import { privacyKey, usePrivacySettings } from '@/features/onboarding/OnboardingContext';
import { PrivacyChoices } from '@/features/onboarding/PrivacyChoices';
import { GoalVisibilityRow } from '@/features/passport/GoalVisibilityRow';
import { InlineError, OfflineNote, useIsOnline } from '@/features/profile/states';
import { track } from '@/lib/analytics';
import { useUserId } from '@/lib/auth';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

/**
 * Settings → Who sees what. Not designed: OnboardPrivacy's choices as a settings screen
 * (HANDOFF.md: "the onboarding privacy screen sets the pattern"). Each tap saves at once to your
 * own `privacy_settings` row (the one table the contract lets clients update directly).
 */
export default function PrivacySettings() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const toast = useToast();
  const online = useIsOnline();
  const privacy = usePrivacySettings();

  useEffect(() => {
    track('screen_viewed', { screen: 'settings_privacy' });
  }, []);

  const save = useMutation({
    mutationFn: async ({ part, value }: { part: PrivacyPart; value: Visibility }) => {
      const { error } = await supabase
        .from('privacy_settings')
        .update(
          part === 'sports'
            ? { sports_visibility: value }
            : part === 'history'
              ? { history_visibility: value }
              : { availability_visibility: value },
        )
        .eq('user_id', userId);
      if (error) throw error;
    },
    onMutate: async ({ part, value }) => {
      await queryClient.cancelQueries({ queryKey: privacyKey(userId) });
      const before = queryClient.getQueryData<Privacy | null>(privacyKey(userId));
      if (before) queryClient.setQueryData<Privacy>(privacyKey(userId), { ...before, [part]: value });
      return { before };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.before) queryClient.setQueryData(privacyKey(userId), ctx.before);
      toast.show({ kind: 'error', message: errorMessage(ojoroErrorOf(e)) });
    },
    onSuccess: (_d, { part, value }) => {
      track('visibility_changed', { part, value });
      toast.show({ kind: 'success', message: 'Saved.' });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: privacyKey(userId) });
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
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
      <View className="px-space-5 pb-space-10 pt-space-4" style={{ gap: 28 }}>
        <View className="gap-space-3">
          <DisplayText size="lg" accessibilityRole="header">
            WHO SEES WHAT?
          </DisplayText>
          <Text variant="body">Each part of your profile has its own setting. Changes save as you tap.</Text>
        </View>
        {!online && privacy.data ? (
          <OfflineNote
            dataUpdatedAt={privacy.dataUpdatedAt}
            what="your settings"
            extra="Changes need a connection."
          />
        ) : null}
        {privacy.data ? (
          <PrivacyChoices
            value={privacy.data}
            disabled={!online}
            onChange={(part, value) => save.mutate({ part, value })}
          >
            <GoalVisibilityRow disabled={!online} />
          </PrivacyChoices>
        ) : privacy.isError ? (
          <InlineError
            message={errorMessage(ojoroErrorOf(privacy.error))}
            action="TRY AGAIN"
            onAction={() => void privacy.refetch()}
          />
        ) : privacy.isPending ? (
          <View {...loadingProps('Loading your settings')}>
            <Skeleton kind="text" lines={6} />
          </View>
        ) : (
          <InlineError message="We can't find your settings. Try again." action="TRY AGAIN" onAction={() => void privacy.refetch()} />
        )}
      </View>
    </Screen>
  );
}
