import { router } from 'expo-router';

import { ActionButton } from '@/components/ActionButton';
import { ActionCard } from '@/components/ActionCard';
import { OjoroScreen } from '@/components/OjoroScreen';

export default function NotificationsScreen() {
  return (
    <OjoroScreen
      eyebrow="Inbox"
      title="ONLY WHAT CAN CHANGE YOUR DAY."
      description="Ojoro ranks notifications by the probability they help you act, not by the probability you reopen the app."
    >
      <ActionCard
        eyebrow="Need one more"
        title="Your Crew is one person away from GAME ON."
        meta="Football · tonight · 7:30 PM"
      >
        <ActionButton label="PULL SOMEONE IN" onPress={() => router.push('/plan/football-tonight')} />
      </ActionCard>
      <ActionCard
        eyebrow="Challenge"
        title="Marcus countered your 5K call-out."
        meta="Sunday instead of Saturday."
      >
        <ActionButton label="REVIEW COUNTER" variant="secondary" onPress={() => router.push('/challenge/marcus-5k')} />
      </ActionCard>
      <ActionCard
        eyebrow="Crew"
        title="Inner Circle is deciding where to play."
        meta="You have not voted on the place yet."
      >
        <ActionButton label="VOTE" variant="secondary" onPress={() => router.push('/crew/inner-circle/poll')} />
      </ActionCard>
    </OjoroScreen>
  );
}
