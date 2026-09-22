import { router } from 'expo-router';

import { ActionButton } from '@/components/ActionButton';
import { ActionCard } from '@/components/ActionCard';
import { OjoroScreen } from '@/components/OjoroScreen';

export default function CreateScreen() {
  return (
    <OjoroScreen
      eyebrow="Create"
      title="MAKE SOMETHING HAPPEN."
      description="Creation starts with intent and can become a Quick Plan, Activity, Challenge or recurring ritual."
    >
      <ActionCard title="Quick Plan" meta="Football tonight, around 7.">
        <ActionButton
          label="START QUICK PLAN"
          onPress={() => router.push('/down-for')}
        />
      </ActionCard>
      <ActionCard title="Challenge" meta="Call out a friend, Crew or Clan.">
        <ActionButton
          label="CREATE CHALLENGE"
          variant="secondary"
          onPress={() => router.push('/challenge/marcus-5k')}
        />
      </ActionCard>
    </OjoroScreen>
  );
}
