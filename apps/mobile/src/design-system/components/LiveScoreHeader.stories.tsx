import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { onSituation, Section } from '../stories/storyKit';
import { IconButton } from './IconButton';
import { LiveIndicator } from './LiveIndicator';
import { LiveClock, LiveScoreHeader } from './LiveScoreHeader';
import { ReducedMotionOverride } from './Overlay';
import { Skeleton } from './Skeleton';

/** A fixed "now" so stories are stable; sample content only. */
const NOW = 1_800_000_000_000;
const STARTED = NOW - (34 * 60 + 12) * 1000;

const meta = {
  title: 'Social/LiveScoreHeader',
  component: LiveScoreHeader,
  parameters: onSituation('live'),
  args: {
    overline: 'FOOTBALL · JEANNE-MANCE · 8 PLAYING',
    a: { name: 'LIGHTS', score: 3 },
    b: { name: 'DARKS', score: 2 },
    updatedAt: NOW - 20_000,
    now: NOW,
    loggedBy: 'Ade (host)',
    testID: 'score',
  },
  argTypes: { offline: { control: { type: 'boolean' } } },
} satisfies Meta<typeof LiveScoreHeader>;

export default meta;

type Story = StoryObj<typeof meta>;

/** LiveActivity: Lights 3 / Darks 2, updated 20 s ago, logged by the host. */
export const Default: Story = {};

/** Just logged. */
export const JustNow: Story = { args: { updatedAt: NOW - 1000 } };

/** Stale: no update for 3 minutes. The alert icon and the words say the score may be behind. */
export const Stale: Story = { args: { updatedAt: NOW - 180_000 } };

/** Offline: the last-known score stays, with how old it is and the offline icon. */
export const Offline: Story = { args: { updatedAt: NOW - 180_000, offline: true } };

/** Double figures and long names wrap; scores stay in tabular figures. */
export const LongNames: Story = {
  args: { a: { name: 'THURSDAY FC', score: 12 }, b: { name: 'MILE END', score: 10 } },
};

/** Before the first goal. */
export const NilNil: Story = {
  args: { a: { name: 'LIGHTS', score: 0 }, b: { name: 'DARKS', score: 0 } },
};

/** Loading: the object skeleton, after 300ms. */
export const Loading: Story = { render: () => <Skeleton kind="object" /> };

/** The whole LiveActivity top: back, LIVE, the running clock (ticks; only the counter pulses), share, then the score. */
export const LiveActivityTop: Story = {
  parameters: onSituation('live', { padded: false }),
  render: (args) => (
    <View>
      <View className="flex-row items-center gap-space-3 px-space-2 pt-space-2">
        <IconButton icon="back" label="Back" />
        <LiveIndicator />
        <LiveClock startedAt={Date.now() - (34 * 60 + 12) * 1000} />
        <View className="ml-auto">
          <IconButton icon="share" label="Share live game" />
        </View>
      </View>
      <View className="px-space-5 pt-space-6">
        <LiveScoreHeader {...args} />
      </View>
    </View>
  ),
};

/** The clock: running, frozen, paused (no pulse) and under reduced motion (still, but ticking). */
export const Clock: Story = {
  render: () => (
    <View>
      <Section title="Running">
        <LiveClock startedAt={Date.now() - 45_000} />
      </Section>
      <Section title="Frozen at 34:12">
        <LiveClock startedAt={STARTED} now={NOW} />
      </Section>
      <Section title="Over an hour">
        <LiveClock startedAt={NOW - (64 * 60 + 9) * 1000} now={NOW} />
      </Section>
      <Section title="Paused">
        <LiveClock startedAt={STARTED} now={NOW} paused />
      </Section>
      <Section title="Reduced motion">
        <ReducedMotionOverride value>
          <LiveClock startedAt={Date.now() - 45_000} />
        </ReducedMotionOverride>
      </Section>
    </View>
  ),
};
