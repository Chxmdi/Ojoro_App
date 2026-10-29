import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { Section } from '../stories/storyKit';
import { Button } from './Button';
import { CHALLENGE_STAGES, ChallengeEventHero, type ChallengeStage } from './ChallengeEventHero';
import { ReducedMotionOverride } from './Overlay';

const meta = {
  title: 'Competition/ChallengeEventHero',
  component: ChallengeEventHero,
  parameters: { ojoro: { padded: false } },
  args: {
    a: { name: 'Chimdi' },
    b: { name: 'Marcus' },
    discipline: '5K',
    stage: 'days',
    countdown: { label: 'STARTS IN', days: 3, hours: 14, minutes: 20 },
  },
  argTypes: {
    stage: { control: { type: 'select' }, options: [...CHALLENGE_STAGES] },
  },
} satisfies Meta<typeof ChallengeEventHero>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Just accepted: forming, CHALLENGE ACCEPTED, the countdown. */
export const Accepted: Story = { args: { stage: 'accepted' } };

/** EventBuildup: forming, CHALLENGE EVENT, names, 5K and STARTS IN 03 14 20. */
export const Days: Story = {};

/** Challenge day: confirmed, TODAY. at the poster hero size. */
export const Today: Story = { args: { stage: 'today', when: '9:00 · Cartier monument' } };

/** EventToday: confirmed, CHECK-IN OPEN, ALMOST TIME. */
export const Soon: Story = { args: { stage: 'soon', when: '9:00 · Cartier monument' } };

/** Live: the LIVE pill, names, then progress takes over. */
export const Live: Story = {
  args: {
    stage: 'live',
    a: { name: 'Chimdi', progress: '3.4 KM', checkedIn: true },
    b: { name: 'Marcus', progress: '3.1 KM', checkedIn: true },
  },
};

/** Verified: after, RESULT · VERIFIED, CHIMDI WINS. */
export const Complete: Story = {
  args: { stage: 'complete', winner: 'Chimdi', result: '22:48 · 43 s ahead' },
};

/** The countdown ticks itself from `to`; only it re-renders. */
export const TickingCountdown: Story = {
  args: { countdown: { label: 'STARTS IN', to: Date.now() + 2 * 3_600_000 + 5_000 } },
};

function Escalation({ reduced }: { reduced: boolean | null }) {
  const [i, setI] = useState(1);
  const stage = CHALLENGE_STAGES[i] as ChallengeStage;
  const checkedIn = i >= 3;
  return (
    <ReducedMotionOverride value={reduced}>
      <View className="p-space-5">
        <Section title={`STAGE · ${stage.toUpperCase()}${checkedIn ? ' · BOTH CHECKED IN' : ''}`}>
          <View className="flex-row gap-space-3">
            <Button variant="secondary" onPress={() => setI((n) => Math.max(0, n - 1))}>
              BACK
            </Button>
            <Button onPress={() => setI((n) => Math.min(CHALLENGE_STAGES.length - 1, n + 1))}>
              NEXT STAGE
            </Button>
          </View>
        </Section>
      </View>
      <ChallengeEventHero
        a={{ name: 'Chimdi', progress: '3.4 KM', checkedIn }}
        b={{ name: 'Marcus', progress: '3.1 KM', checkedIn }}
        discipline="5K"
        stage={stage}
        when="9:00 · Cartier monument"
        countdown={{ label: 'STARTS IN', days: 3, hours: 14, minutes: 20 }}
        winner="Chimdi"
      />
    </ReducedMotionOverride>
  );
}

/**
 * Walk the stages forward: the ground escalates and the content cross-fades
 * (120ms). Medium haptic when both check in (soon), success on complete.
 */
export const Escalate: Story = { render: () => <Escalation reduced={null} /> };

/** The same under reduced motion: still a 120ms cross-fade, nothing moves. */
export const EscalateReducedMotion: Story = { render: () => <Escalation reduced /> };

/** Long names wrap at display-xl; nothing truncates. */
export const LongNames: Story = {
  args: { a: { name: 'Oluwaseun' }, b: { name: 'Jean-Baptiste' } },
};
