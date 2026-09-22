import { router } from 'expo-router';
import { useState } from 'react';

import { ActionButton } from '@/components/ActionButton';
import { OjoroScreen } from '@/components/OjoroScreen';
import { PollCard } from '@/components/PollCard';
import { track } from '@/lib/analytics';

export default function CrewPollScreen() {
  const [time, setTime] = useState('1930');
  const [place, setPlace] = useState('jm');

  return (
    <OjoroScreen
      eyebrow="Make This a Game"
      title="TURN THE CHAT INTO A PLAN."
      description="Ojoro carries forward what the Crew already knows and asks only for unresolved decisions."
    >
      <PollCard
        eyebrow="Shared availability"
        title="When works?"
        selected={time}
        onSelect={setTime}
        options={[
          { id: '1900', label: '7:00 PM', votes: 2 },
          { id: '1930', label: '7:30 PM', votes: 4 },
          { id: '2000', label: '8:00 PM', votes: 1 },
        ]}
      />
      <PollCard
        eyebrow="Nearby places"
        title="Where should we play?"
        selected={place}
        onSelect={setPlace}
        options={[
          { id: 'jm', label: 'Jeanne-Mance Park · 11 min', votes: 4 },
          { id: 'laf', label: 'Parc La Fontaine · 16 min', votes: 2 },
          { id: 'mcg', label: 'McGill Gym · 18 min', votes: 1 },
        ]}
      />
      <ActionButton
        label="CREATE PLAN FORMING"
        onPress={() => {
          track('crew_plan_poll_confirmed', { time, place });
          router.push('/plan/football-tonight');
        }}
      />
    </OjoroScreen>
  );
}
