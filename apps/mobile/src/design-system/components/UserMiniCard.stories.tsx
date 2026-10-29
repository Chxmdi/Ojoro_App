import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { EachSituation, Section, onSituation } from '../stories/storyKit';
import { Divider } from './Divider';
import { Text } from './Text';
import { UserMiniCard, type UserMiniCardProps } from './UserMiniCard';

function FollowToggle(props: UserMiniCardProps) {
  const [following, setFollowing] = useState(false);
  return (
    <UserMiniCard
      {...props}
      following={following}
      onFollow={() => setFollowing((f) => !f)}
      onCallOut={() => {}}
      onPress={() => {}}
    />
  );
}

const meta = {
  title: 'Social/UserMiniCard',
  component: UserMiniCard,
  args: {
    name: 'Ade B',
    handle: 'adeb',
    area: 'Mile End',
    verified: true,
    sports: ['Football', 'Running'],
    stats: [
      { value: '61', label: 'Sessions' },
      { value: '6', label: 'Games with you' },
      { value: '2', label: 'Crews' },
    ],
    following: false,
  },
  parameters: onSituation('calm'),
} satisfies Meta<typeof UserMiniCard>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The Discover card: FOLLOW, CALL OUT, opens the profile. */
export const Default: Story = {
  args: { onFollow: () => {}, onCallOut: () => {}, onPress: () => {}, testID: 'card' },
};

/** FOLLOW toggles to FOLLOWING (secondary, pressed). */
export const Following: Story = {
  args: { following: true, onFollow: () => {}, onCallOut: () => {} },
};

/** FOLLOW while the follow is saved. */
export const FollowPending: Story = {
  args: { followPending: true, onFollow: () => {}, onCallOut: () => {} },
};

/** Tap to toggle FOLLOW / FOLLOWING. */
export const Interactive: Story = {
  render: (args) => <FollowToggle {...args} />,
};

/** Not ID verified, no area, no stats: name, handle, sports. */
export const Minimal: Story = {
  args: {
    name: 'Lena R',
    handle: 'lenar',
    area: undefined,
    verified: false,
    stats: undefined,
    sports: ['Running'],
    onFollow: () => {},
    onCallOut: () => {},
  },
};

/** Your own card: no FOLLOW, no CALL OUT. */
export const NoActions: Story = {
  args: { onFollow: undefined, onCallOut: undefined },
};

/** A long name and three sports wrap; nothing truncates. */
export const LongContent: Story = {
  args: {
    name: 'Oluwaseun Adebayo-Williams',
    handle: 'seun.adebayo.williams',
    area: 'Côte-des-Neiges',
    sports: ['Football', 'Running', 'Boxing', 'Basketball'],
    onFollow: () => {},
    onCallOut: () => {},
  },
};

/** Discover › People to move with: the overlap reason is the screen's line, above the card. */
export const DiscoverSection: Story = {
  render: (args) => (
    <View className="gap-space-4">
      <Divider label="PEOPLE TO MOVE WITH" />
      <Text variant="body-sm" muted>
        You've played 6 games together and you both run on Saturdays.
      </Text>
      <UserMiniCard {...args} onFollow={() => {}} onCallOut={() => {}} onPress={() => {}} />
    </View>
  ),
};

export const Situations: Story = {
  parameters: { ojoro: { padded: false } },
  render: (args) => (
    <EachSituation only={['calm', 'forming', 'after']}>
      <UserMiniCard {...args} onFollow={() => {}} onCallOut={() => {}} />
    </EachSituation>
  ),
};

export const AllStates: Story = {
  render: (args) => (
    <View>
      <Section title="Follow">
        <UserMiniCard {...args} onFollow={() => {}} onCallOut={() => {}} />
      </Section>
      <Section title="Following">
        <UserMiniCard {...args} following onFollow={() => {}} onCallOut={() => {}} />
      </Section>
    </View>
  ),
};
