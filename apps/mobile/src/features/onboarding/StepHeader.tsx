import { router } from 'expo-router';
import { View } from 'react-native';

import { IconButton, Progress, Text } from '@/design-system';

/**
 * The onboarding header (OnboardSports/When/Privacy): back, the step progress, "1 OF 3".
 * `onBack` defaults to going back; the back button hides when there's nowhere to go.
 */
export function StepHeader({
  step,
  of = 3,
  onBack,
}: {
  step: number;
  of?: number;
  onBack?: (() => void) | undefined;
}) {
  const canBack = onBack !== undefined || router.canGoBack();
  return (
    <View className="flex-row items-center gap-space-3 pl-space-2 pr-space-3 pt-space-2">
      {canBack ? (
        <IconButton icon="back" label="Back" onPress={onBack ?? (() => router.back())} />
      ) : (
        <View style={{ width: 44, height: 44 }} />
      )}
      <View className="flex-1">
        <Progress value={step} max={of} label={`Step ${step} of ${of}`} />
      </View>
      <Text variant="label" muted style={{ fontVariant: ['tabular-nums'] }}>
        {`${step} OF ${of}`}
      </Text>
    </View>
  );
}
