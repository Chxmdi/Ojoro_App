import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { EachSituation, onSituation } from '../stories/storyKit';
import { Divider } from './Divider';
import { PlaceMiniCard } from './PlaceMiniCard';
import { Text } from './Text';

const meta = {
  title: 'Social/PlaceMiniCard',
  component: PlaceMiniCard,
  args: {
    name: 'Jeanne-Mance Park',
    kind: 'Football',
    surface: 'Turf · north pitch',
    distance: '1.2 km',
    lights: '11 PM',
    plansTonight: 4,
  },
  argTypes: { plansTonight: { control: { type: 'number' } } },
  parameters: onSituation('forming'),
} satisfies Meta<typeof PlaceMiniCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { onPress: () => {} } };

/** Plan › WHERE, on forming. */
export const PlanWhere: Story = {
  render: (args) => (
    <View className="gap-space-2">
      <Divider label="WHERE" />
      <PlaceMiniCard {...args} onPress={() => {}} testID="place" />
      <Text variant="caption" muted>
        Proposed by Ade. The exact pitch is shared with people in the plan only.
      </Text>
    </View>
  ),
};

/** Discover › Places: with and without lights, surface and plans tonight. */
export const DiscoverList: Story = {
  parameters: onSituation('calm'),
  render: () => (
    <View>
      <PlaceMiniCard
        name="Jeanne-Mance Park"
        kind="Football"
        surface="Turf"
        distance="1.2 km"
        lights="11 PM"
        plansTonight={4}
        onPress={() => {}}
      />
      <PlaceMiniCard
        name="Hoshino Boxing"
        kind="Gym"
        testID="gym"
        distance="2.8 km"
        plansTonight={1}
        onPress={() => {}}
      />
      <PlaceMiniCard
        name="Lachine Canal"
        kind="Running route"
        testID="route"
        surface="Paved · 8 km loop"
        distance="4 km"
        onPress={() => {}}
      />
    </View>
  ),
};

export const Situations: Story = {
  parameters: { ojoro: { padded: false } },
  render: (args) => (
    <EachSituation only={['calm', 'forming']}>
      <PlaceMiniCard {...args} onPress={() => {}} />
    </EachSituation>
  ),
};
