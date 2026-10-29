import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { EachSituation, onSituation, Section } from '../stories/storyKit';
import { ReactionBar, toggleReaction, type Reaction } from './ReactionBar';
import { Text } from './Text';

const LIVE_ACTIVITY: Reaction[] = [
  { label: 'LET’S GO', count: 9, mine: true },
  { label: 'RESPECT', count: 4 },
  { label: 'HOLD THAT', count: 2 },
];

const meta = {
  title: 'Social/ReactionBar',
  component: ReactionBar,
  parameters: onSituation('live'),
  args: { reactions: LIVE_ACTIVITY, testID: 'reactions' },
  argTypes: { disabled: { control: { type: 'boolean' } } },
} satisfies Meta<typeof ReactionBar>;

export default meta;

type Story = StoryObj<typeof meta>;

/** LiveActivity: THURSDAY FC IS FOLLOWING, your LET’S GO filled. */
export const Default: Story = {};

/** EventLive: bigger counts stay steady in tabular numerals. */
export const EventLive: Story = {
  args: {
    reactions: [
      { label: 'LET’S GO', count: 88, mine: true },
      { label: 'RESPECT', count: 41 },
      { label: 'HOLD THAT', count: 17 },
    ],
  },
};

/** The whole vocabulary, none yours, on calm. */
export const AllFour: Story = {
  parameters: onSituation('calm'),
  args: {
    reactions: [
      { label: 'LET’S GO', count: 0 },
      { label: 'RESPECT', count: 3 },
      { label: 'HOLD THAT', count: 1 },
      { label: 'RUN IT BACK', count: 12 },
    ],
  },
};

/** Offline: last-known counts, buttons don't take presses. */
export const Offline: Story = {
  render: (args) => (
    <View className="gap-space-3">
      <ReactionBar {...args} disabled />
      <Text variant="caption" muted>
        Offline. Counts from 2 min ago.
      </Text>
    </View>
  ),
};

/** Optimistic toggle: tap flips yours and moves the count at once, per person. */
export const Interactive: Story = {
  render: function Render() {
    const [reactions, setReactions] = useState(LIVE_ACTIVITY);
    return (
      <ReactionBar
        reactions={reactions}
        onReact={(label) => setReactions((r) => toggleReaction(r, label))}
      />
    );
  },
};

/** Yours fills with `signal`: oxblood on calm, forming and after; white on confirmed and live. */
export const OnEachSituation: Story = {
  parameters: { ojoro: { padded: false } },
  render: () => (
    <EachSituation>
      <ReactionBar reactions={LIVE_ACTIVITY} />
    </EachSituation>
  ),
};

/** Mine vs not mine, enabled vs disabled. */
export const States: Story = {
  render: () => (
    <View>
      <Section title="Not reacted">
        <ReactionBar reactions={[{ label: 'RESPECT', count: 4 }]} />
      </Section>
      <Section title="You reacted">
        <ReactionBar reactions={[{ label: 'RESPECT', count: 5, mine: true }]} />
      </Section>
      <Section title="Disabled">
        <ReactionBar
          disabled
          reactions={[
            { label: 'RESPECT', count: 5, mine: true },
            { label: 'HOLD THAT', count: 2 },
          ]}
        />
      </Section>
    </View>
  ),
};
