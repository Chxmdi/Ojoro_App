import { router } from 'expo-router';

import { ActionButton } from '@/components/ActionButton';
import { ActionCard } from '@/components/ActionCard';
import { OjoroScreen } from '@/components/OjoroScreen';

export default function PrototypeIndex() {
  return (
    <OjoroScreen
      eyebrow="D0 Prototype"
      title="THE SIX FLOWS."
      description="These are the interaction contracts D0 must prove before deep production implementation."
    >
      <ActionCard title="Movement" meta="I’M DOWN → GAME ON → Live → Recap">
        <ActionButton
          label="START"
          onPress={() => router.push('/down-for')}
        />
      </ActionCard>
      <ActionCard title="Crew" meta="Chat → Make This a Game → Plan">
        <ActionButton
          label="OPEN CREW"
          variant="secondary"
          onPress={() => router.push('/crew/inner-circle')}
        />
      </ActionCard>
      <ActionCard title="Challenge" meta="Call-Out → Accept/Counter → Rematch">
        <ActionButton
          label="OPEN CHALLENGE"
          variant="secondary"
          onPress={() => router.push('/challenge/marcus-5k')}
        />
      </ActionCard>
      <ActionCard title="Activation" meta="Onboarding → First move">
        <ActionButton
          label="START ONBOARDING"
          variant="secondary"
          onPress={() => router.push('/onboarding')}
        />
      </ActionCard>
      <ActionCard title="Ojoro Now" meta="Nothing exists → create from latent demand">
        <ActionButton
          label="OPEN MAP"
          variant="secondary"
          onPress={() => router.push('/map')}
        />
      </ActionCard>
      <ActionCard title="Identity" meta="Physical autobiography → Passport">
        <ActionButton
          label="OPEN PASSPORT"
          variant="secondary"
          onPress={() => router.push('/passport')}
        />
      </ActionCard>
    </OjoroScreen>
  );
}
