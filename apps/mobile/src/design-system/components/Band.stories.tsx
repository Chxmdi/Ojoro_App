import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { onSituation } from '../stories/storyKit';
import { ActivityStrip } from './ActivityStrip';
import { Band, type BandProps } from './Band';
import { LatentDemand } from './LatentDemand';
import { Progress } from './Progress';
import { Text } from './Text';

// `situation` is the story frame's own control (taken out of args by the
// preview decorator), so each story passes the band's situation in render.
type BandArgs = Omit<BandProps, 'situation' | 'children'>;

const meta = {
  title: 'Primitives/Band',
  args: { accessibilityLabel: 'Ojoro Now' },
  parameters: onSituation('calm'),
} satisfies Meta<BandArgs>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Discover › Ojoro Now: a forming band inside the calm page, past the gutter. */
export const OjoroNow: Story = {
  render: (args) => (
    <View className="gap-space-10">
      <Text variant="display-lg">DISCOVER</Text>
      <Band {...args} situation="forming" testID="band">
        <Text variant="overline">OJORO NOW · WITHIN THE HOUR</Text>
        <Text variant="display-xl">RIGHT NOW.</Text>
        <Text variant="body">3 things start soon. 4 of your friends are free until 9.</Text>
        <View>
          <ActivityStrip
            activity="Sparring rounds"
            time="NOW"
            place="Hoshino Boxing · 2.8 km"
            status="live"
          />
          <ActivityStrip
            activity="5K river run"
            time="6:30"
            place="Lachine Canal · 4 km"
            status="confirmed"
          />
          <ActivityStrip
            activity="Pickup football"
            time="7:30"
            place="Jeanne-Mance Park · 1.2 km"
            count={6}
            capacity={8}
            onPress={() => {}}
          />
        </View>
        <LatentDemand
          count={5}
          overline="NOTHING ON FOR VOLLEYBALL"
          headline="5 people within 3 km want to play volleyball after 7. That's a game."
          onPress={() => {}}
          onSurpriseMe={() => {}}
        />
      </Band>
      <Text variant="body-sm" muted>
        The page continues on calm.
      </Text>
    </View>
  ),
};

/** Clan › October mission: after, 12 gap. */
export const After: Story = {
  args: { gap: 12, accessibilityLabel: 'October mission' },
  render: (args) => (
    <Band {...args} situation="after">
      <Text variant="overline">OCTOBER MISSION</Text>
      <Text variant="display-md">2,000 KM AS A CLAN.</Text>
      <Progress value={6} max={10} label="1,240 of 2,000 km" />
      <Text variant="body-sm">1,240 km so far, from 96 runners. Your share: 46 km.</Text>
    </Band>
  ),
};

/** Without bleed, inside a container that has no gutter. */
export const NoBleed: Story = {
  parameters: onSituation('calm', { padded: false }),
  args: { bleed: false },
  render: (args) => (
    <Band {...args} situation="forming">
      <Text variant="overline">PEOPLE WANT THIS</Text>
      <Text variant="display-md">AN EASY 5K THIS WEEK.</Text>
    </Band>
  ),
};
