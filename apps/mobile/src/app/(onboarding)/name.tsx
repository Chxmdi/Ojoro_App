import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, DisplayText, Input, Screen, Text } from '@/design-system';
import { nameError, NAME_MAX } from '@/features/onboarding/draft';
import { useOnboarding } from '@/features/onboarding/OnboardingContext';
import { track } from '@/lib/analytics';

/**
 * Your name, before the three steps. Not designed: a phone sign-up has no name and every plan,
 * roster and profile shows one. Shown only when the profile has none. Saved with LET'S MOVE.
 */
export default function OnboardName() {
  const { draft, update } = useOnboarding();
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    track('screen_viewed', { screen: 'onboard_name' });
  }, []);

  const next = () => {
    const problem = nameError(draft.name);
    if (problem) {
      setError(problem);
      return;
    }
    track('onboarding_step_completed', { step: 'name' });
    router.push('/sports');
  };

  return (
    <Screen situation="calm" scroll gutter={false}>
      <View className="gap-space-6 px-space-5 pb-space-8 pt-space-12">
        <View className="gap-space-3">
          <DisplayText size="lg" accessibilityRole="header">
            WHAT DO PEOPLE CALL YOU?
          </DisplayText>
          <Text variant="body">
            People in your plans and games see this name. A first name and an initial is plenty.
          </Text>
        </View>
        <Input
          label="Your name"
          value={draft.name}
          onChangeText={(name) => {
            update((d) => ({ ...d, name }));
            if (error) setError(undefined);
          }}
          autoComplete="name"
          textContentType="name"
          autoCapitalize="words"
          maxLength={NAME_MAX + 10}
          returnKeyType="next"
          onSubmitEditing={next}
          error={error}
          testID="name-input"
        />
        <Button block onPress={next} testID="name-continue">
          CONTINUE
        </Button>
      </View>
    </Screen>
  );
}
