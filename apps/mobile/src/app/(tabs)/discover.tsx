import { router } from 'expo-router';

import { ActionButton } from '@/components/ActionButton';
import { ActionCard } from '@/components/ActionCard';
import { OjoroScreen } from '@/components/OjoroScreen';

export default function DiscoverScreen() {
  return (
    <OjoroScreen
      eyebrow="Discover"
      title="FIND YOUR NEXT MOVE."
      description="Discovery ranks what is feasible, social and actionable—not what keeps you scrolling."
    >
      <ActionCard
        eyebrow="Nearby now"
        title="11 people are down for football tonight."
        meta="No event exists yet. Ojoro can make one."
      >
        <ActionButton
          label="MAKE IT HAPPEN"
          onPress={() => router.push('/plan/football-tonight')}
        />
      </ActionCard>
      <ActionCard
        eyebrow="Place"
        title="Jeanne-Mance Park"
        meta="3 activities soon · football demand forming"
      >
        <ActionButton
          label="OPEN LIVE MAP"
          variant="secondary"
          onPress={() => router.push('/map')}
        />
      </ActionCard>
    </OjoroScreen>
  );
}
