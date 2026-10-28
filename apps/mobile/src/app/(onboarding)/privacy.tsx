import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { View } from 'react-native';

import { Button, DisplayText, Screen, Text } from '@/design-system';
import { profileGateKey } from '@/features/auth/useGate';
import { setPrivacy, toSaveArgs } from '@/features/onboarding/draft';
import {
  privacyKey,
  useOnboarding,
  usePrivacySettings,
} from '@/features/onboarding/OnboardingContext';
import { PrivacyChoices } from '@/features/onboarding/PrivacyChoices';
import { StepHeader } from '@/features/onboarding/StepHeader';
import { InlineError, useIsOnline } from '@/features/profile/states';
import { track } from '@/lib/analytics';
import { useUserId } from '@/lib/auth';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf, rpc } from '@/lib/rpc';

/**
 * Onboarding 3 · Privacy (OnboardPrivacy.png): who sees what, with the product defaults (read from
 * your `privacy_settings` row). LET'S MOVE saves all three steps in one `save_onboarding` call;
 * the auth gate then lands on Home (or the deep link opened before signing in).
 */
export default function OnboardPrivacy() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const online = useIsOnline();
  const { draft, update } = useOnboarding();
  const server = usePrivacySettings();
  const privacy = draft.privacyTouched ? draft.privacy : (server.data ?? draft.privacy);

  useEffect(() => {
    track('screen_viewed', { screen: 'onboard_privacy' });
  }, []);

  const save = useMutation({
    mutationFn: () => rpc('save_onboarding', toSaveArgs({ ...draft, privacy })),
    networkMode: 'online',
    onSuccess: (profile) => {
      track('onboarding_step_completed', { step: 'privacy' });
      track('onboarding_completed', {
        sports: draft.sports.length,
        free_slots: draft.slots.length,
        radius_km: draft.radiusKm,
        pull_me_in: draft.pullMeIn.length,
        privacy_changed: draft.privacyTouched,
      });
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      void queryClient.invalidateQueries({ queryKey: privacyKey(userId) });
      // Flips the gate: RouteGuard moves on to Home.
      queryClient.setQueryData(profileGateKey(userId), {
        onboardingCompleted: true,
        hasName: (profile.display_name ?? '').trim().length > 0,
      });
    },
  });

  return (
    <Screen situation="calm" scroll gutter={false}>
      <StepHeader step={3} />
      <View className="px-space-5 pb-space-8 pt-space-6" style={{ gap: 28 }}>
        <View className="gap-space-3">
          <DisplayText size="lg" accessibilityRole="header">
            WHO SEES WHAT?
          </DisplayText>
          <Text variant="body">
            Each part of your profile has its own setting. These are the defaults; change any of
            them now or later.
          </Text>
        </View>

        <PrivacyChoices
          value={privacy}
          onChange={(part, value) =>
            update((d) => setPrivacy({ ...d, privacy }, part, value))
          }
        />

        {save.isError ? (
          <InlineError
            message={errorMessage(ojoroErrorOf(save.error))}
            testID="onboarding-save-error"
          />
        ) : null}
        {!online ? (
          <Text variant="body-sm" muted testID="onboarding-offline">
            {"You're offline. Your choices are kept here; LET'S MOVE saves them when you're back."}
          </Text>
        ) : null}
        <Button
          variant="commit"
          block
          loading={save.isPending}
          disabled={!online}
          onPress={() => save.mutate()}
          testID="onboarding-lets-move"
        >
          {"LET'S MOVE"}
        </Button>
      </View>
    </Screen>
  );
}
