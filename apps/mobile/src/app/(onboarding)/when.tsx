import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { AvailabilityGrid, Button, Chip, DisplayText, Divider, Screen, Text } from '@/design-system';
import { RADIUS_CHOICES, togglePullMeIn } from '@/features/onboarding/draft';
import { useOnboarding, useSports } from '@/features/onboarding/OnboardingContext';
import { StepHeader } from '@/features/onboarding/StepHeader';
import { track } from '@/lib/analytics';

/**
 * Onboarding 2 · Time and distance (OnboardWhen.png): the usual-free grid, how far, Pull Me In
 * per chosen sport. Only ever shown to others as overlap, never as a calendar.
 */
export default function OnboardWhen() {
  const { draft, update } = useOnboarding();
  const sports = useSports();
  const nameOf = (id: string) => sports.data?.find((s) => s.id === id)?.name ?? id;

  useEffect(() => {
    track('screen_viewed', { screen: 'onboard_when' });
  }, []);

  const next = () => {
    track('onboarding_step_completed', {
      step: 'when',
      free_slots: draft.slots.length,
      radius_km: draft.radiusKm,
      pull_me_in: draft.pullMeIn.length,
    });
    router.push('/area');
  };

  return (
    <Screen situation="calm" scroll gutter={false}>
      <StepHeader step={2} />
      <View className="gap-space-8 px-space-5 pb-space-8 pt-space-6">
        <View className="gap-space-3">
          <DisplayText size="lg" accessibilityRole="header">
            WHEN ARE YOU USUALLY FREE?
          </DisplayText>
          <Text variant="body">
            Rough is fine. Ojoro uses it to suggest times, and only ever shows overlap, never your
            calendar.
          </Text>
          <View className="mt-space-2">
            <AvailabilityGrid
              value={draft.slots}
              onChange={(slots) => update((d) => ({ ...d, slots }))}
              testID="availability-grid"
            />
          </View>
        </View>

        <View className="gap-space-3" aria-label="How far">
          <Divider label="HOW FAR WILL YOU GO?" />
          <View role="radiogroup" aria-label="Distance" className="flex-row flex-wrap gap-space-2">
            {RADIUS_CHOICES.map((km) => (
              <Chip
                key={km}
                selected={draft.radiusKm === km}
                onPress={() => update((d) => ({ ...d, radiusKm: km }))}
                testID={`radius-${km}`}
              >
                {`${km} km`}
              </Chip>
            ))}
          </View>
        </View>

        <View className="gap-space-3" aria-label="Pull me in">
          <Divider label="PULL ME IN" />
          {draft.sports.length > 0 ? (
            <>
              <Text variant="body-sm">
                When a game needs one more, your Crews can invite you directly for:
              </Text>
              <View
                role="group"
                aria-label="Pull me in for"
                className="flex-row flex-wrap gap-space-2"
              >
                {draft.sports.map((id) => (
                  <Chip
                    key={id}
                    selected={draft.pullMeIn.includes(id)}
                    onPress={() => update((d) => togglePullMeIn(d, id))}
                    testID={`pull-me-in-${id}`}
                  >
                    {nameOf(id)}
                  </Chip>
                ))}
              </View>
              <Text variant="caption" muted>
                {'Turn it off any time. Nobody sees you as "available" outside the Crews you choose.'}
              </Text>
            </>
          ) : (
            <Text variant="body-sm" muted>
              Pick a sport first and you can let your Crews invite you to it. You can add sports
              any time from your profile.
            </Text>
          )}
        </View>

        <Button block onPress={next} testID="when-continue">
          CONTINUE
        </Button>
      </View>
    </Screen>
  );
}
