import { router } from 'expo-router';

import { ActionButton } from '@/components/ActionButton';
import { ActionCard } from '@/components/ActionCard';
import { OjoroScreen } from '@/components/OjoroScreen';

export default function ClanClashRecapScreen() {
  return (
    <OjoroScreen
      eyebrow="Clash complete"
      title="McGILL TAKES IT 5–4."
      description="The recap remembers the competition while turning attention toward the next shared action."
    >
      <ActionCard
        eyebrow="Rivalry record"
        title="McGill leads 2–1"
        meta="5 contest cards · 48 participants · organizer verified"
        dark
      />
      <ActionCard
        eyebrow="Community"
        title="12 first-time participants"
        meta="The most important result: people who joined the community through the rivalry."
      />
      <ActionButton label="RUN THE CLASH BACK" onPress={() => router.replace('/clan/mcgill/clash')} />
      <ActionButton label="RETURN TO CLAN" variant="secondary" onPress={() => router.replace('/clan/mcgill')} />
    </OjoroScreen>
  );
}
