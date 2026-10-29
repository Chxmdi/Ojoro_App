import { router } from 'expo-router';
import { useEffect } from 'react';

import { Screen } from '@/design-system';
import { AreaPicker } from '@/features/area/AreaPicker';
import { useOnboarding } from '@/features/onboarding/OnboardingContext';
import { StepHeader } from '@/features/onboarding/StepHeader';
import { track } from '@/lib/analytics';

/**
 * Onboarding · Your area (undesigned). Part of step 2 (time and distance), after "how far" and
 * before privacy, so the progress stays at 2 OF 3 as designed. Saved at once with `set_area`
 * (save_onboarding keeps it), together with the distance just picked. NOT NOW skips; Home asks
 * once more later.
 */
export default function OnboardArea() {
  const { draft } = useOnboarding();

  useEffect(() => {
    track('screen_viewed', { screen: 'onboard_area' });
  }, []);

  const next = (picked: boolean) => {
    track('onboarding_step_completed', { step: 'area', picked });
    router.push('/privacy');
  };

  return (
    <Screen situation="calm" scroll gutter={false}>
      <AreaPicker
        source="onboarding"
        header={<StepHeader step={2} />}
        title="WHERE DO YOU PLAY?"
        body="Pick your neighbourhood. Ojoro shows what's starting around it, within the distance you chose."
        submitLabel="CONTINUE"
        radiusKm={draft.radiusKm}
        onSaved={() => next(true)}
        onSkip={() => next(false)}
      />
    </Screen>
  );
}
