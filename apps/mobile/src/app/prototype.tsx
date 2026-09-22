import { router } from 'expo-router';

import { ActionButton } from '@/components/ActionButton';
import { ActionCard } from '@/components/ActionCard';
import { OjoroScreen } from '@/components/OjoroScreen';

export default function PrototypeIndex() {
  return (
    <OjoroScreen
      eyebrow="D0 Prototype"
      title="THE CORE FLOWS."
      description="These are real navigable interaction contracts, not disconnected mockups."
    >
      <ActionCard title="Movement" meta="I’M DOWN → GAME ON → Live → Recap">
        <ActionButton label="START" onPress={() => router.push('/down-for')} />
      </ActionCard>
      <ActionCard title="Crew" meta="Chat → polls → Plan Forming">
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
      <ActionCard title="Activation" meta="Identity → permissions → first move">
        <ActionButton
          label="START ONBOARDING"
          variant="secondary"
          onPress={() => router.push('/onboarding')}
        />
      </ActionCard>
      <ActionCard title="Clan Clash" meta="Rivalry → roster → result → recap">
        <ActionButton
          label="OPEN CLAN"
          variant="secondary"
          onPress={() => router.push('/clan/mcgill')}
        />
      </ActionCard>
      <ActionCard title="Ojoro Now" meta="Empty market → latent demand → plan">
        <ActionButton
          label="OPEN OJORO NOW"
          variant="secondary"
          onPress={() => router.push('/ojoro-now')}
        />
      </ActionCard>
      <ActionCard title="Identity" meta="Physical autobiography → Passport">
        <ActionButton
          label="OPEN PASSPORT"
          variant="secondary"
          onPress={() => router.push('/passport')}
        />
      </ActionCard>
      <ActionCard title="System states" meta="Loading, empty, offline, privacy and recovery">
        <ActionButton
          label="REVIEW STATES"
          variant="secondary"
          onPress={() => router.push('/system-states')}
        />
      </ActionCard>
      <ActionCard title="Notifications" meta="Actionable, finite and socially useful">
        <ActionButton
          label="OPEN INBOX"
          variant="secondary"
          onPress={() => router.push('/notifications')}
        />
      </ActionCard>
    </OjoroScreen>
  );
}
