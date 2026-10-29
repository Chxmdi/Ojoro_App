import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { onSituation } from '../stories/storyKit';
import { LatentDemand, type LatentDemandProps } from './LatentDemand';
import { Text } from './Text';

function JoinToggle(props: LatentDemandProps) {
  const [joined, setJoined] = useState(false);
  return <LatentDemand {...props} joined={joined} onPress={() => setJoined((j) => !j)} />;
}

const meta = {
  title: 'Movement/LatentDemand',
  component: LatentDemand,
  args: {
    variant: 'panel',
    count: 5,
    overline: 'NOTHING ON FOR VOLLEYBALL',
    headline: "5 people within 3 km want to play volleyball after 7. That's a game.",
  },
  argTypes: {
    count: { control: { type: 'number' } },
    threshold: { control: { type: 'number' } },
  },
  parameters: onSituation('forming'),
} satisfies Meta<typeof LatentDemand>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Discover › Ojoro Now: MAKE IT HAPPEN and SURPRISE ME. */
export const Panel: Story = {
  args: { onPress: () => {}, onSurpriseMe: () => {}, testID: 'demand' },
};

/** Without the surprise path. */
export const PanelOnlyAction: Story = {
  args: { onPress: () => {} },
};

/** MAKE IT HAPPEN while the plan is being created. */
export const PanelPending: Story = {
  args: { onPress: () => {}, onSurpriseMe: () => {}, pending: true },
};

/** FirstHome › PEOPLE WANT THIS: a forming band with the count toward 4. */
export const BandVariant: Story = {
  name: 'Band',
  parameters: onSituation('calm'),
  args: {
    variant: 'band',
    count: 3,
    threshold: 4,
    overline: 'PEOPLE WANT THIS',
    headline: 'AN EASY 5K THIS WEEK.',
    summary:
      '3 runners nearby are down for an evening run. Add yourself and it becomes a plan at 4.',
    testID: 'demand',
  },
  render: (args) => <JoinToggle {...args} />,
};

/** You've added yourself: YOU'RE DOWN. */
export const BandJoined: Story = {
  parameters: onSituation('calm'),
  args: {
    variant: 'band',
    count: 4,
    threshold: 4,
    joined: true,
    overline: 'PEOPLE WANT THIS',
    headline: 'AN EASY 5K THIS WEEK.',
    summary: '4 runners nearby are down for an evening run.',
    onPress: () => {},
  },
};

/** Nobody wants it: nothing renders, and the screen shows its next action. */
export const Empty: Story = {
  args: { count: 0, onPress: () => {} },
  render: (args) => (
    <View className="gap-space-3">
      <LatentDemand {...args} />
      <Text variant="caption" muted>
        (count 0: LatentDemand renders nothing)
      </Text>
    </View>
  ),
};
