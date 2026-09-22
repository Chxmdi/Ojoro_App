import { router } from 'expo-router';

import { ActionButton } from '@/components/ActionButton';
import { ActionCard } from '@/components/ActionCard';
import { OjoroScreen } from '@/components/OjoroScreen';

export default function YouScreen() {
  return (
    <OjoroScreen
      eyebrow="You"
      title="YOUR LIFE IN MOTION."
      description="Progress, contribution, relationships and places—not follower count."
    >
      <ActionCard title="Physical Identity" meta="Movement · Growth · Community · Reliability · Exploration · Competition">
        <ActionButton
          label="OPEN PROFILE"
          onPress={() => router.push('/profile/chimdi')}
        />
      </ActionCard>
      <ActionCard title="Passport" meta="The record of what you actually did.">
        <ActionButton
          label="OPEN PASSPORT"
          variant="secondary"
          onPress={() => router.push('/passport')}
        />
      </ActionCard>
    </OjoroScreen>
  );
}
