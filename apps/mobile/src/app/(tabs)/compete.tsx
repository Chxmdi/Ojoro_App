import { router } from 'expo-router';

import { ActionButton } from '@/components/ActionButton';
import { ActionCard } from '@/components/ActionCard';
import { OjoroScreen } from '@/components/OjoroScreen';

export default function CompeteScreen() {
  return (
    <OjoroScreen
      eyebrow="Compete"
      title="RIVALRY WITH A REASON."
      description="Safe, bounded competition between people and groups that can actually meet."
      dark
    >
      <ActionCard
        dark
        eyebrow="Pending"
        title="Marcus → Chimdi"
        meta="5K · this weekend"
      >
        <ActionButton
          label="RESPOND"
          onPress={() => router.push('/challenge/marcus-5k')}
        />
      </ActionCard>
    </OjoroScreen>
  );
}
