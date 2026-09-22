import { router } from 'expo-router';

import { ActionButton } from '@/components/ActionButton';
import { ActionCard } from '@/components/ActionCard';
import { OjoroScreen } from '@/components/OjoroScreen';
import { SystemState } from '@/components/SystemState';

export default function OjoroNowScreen() {
  return (
    <OjoroScreen
      eyebrow="Ojoro Now"
      title="NOTHING EXISTS. YET."
      description="Ojoro does not stop at an empty marketplace. It can turn nearby compatible intent into a real plan."
    >
      <SystemState
        kind="empty"
        actionLabel="CREATE FROM DEMAND"
        onAction={() => router.push('/plan/football-tonight')}
      />
      <ActionCard
        eyebrow="Latent demand"
        title="11 people nearby are down for football tonight."
        meta="7 overlap after 7 PM · 2 suitable places · social/balanced"
      >
        <ActionButton
          label="MAKE IT HAPPEN"
          onPress={() => router.push('/plan/football-tonight')}
        />
      </ActionCard>
    </OjoroScreen>
  );
}
