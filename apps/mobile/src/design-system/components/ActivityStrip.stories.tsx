import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { EachSituation, onSituation } from '../stories/storyKit';
import { ActivityStrip, ACTIVITY_STATUSES } from './ActivityStrip';
import { Divider } from './Divider';
import { StripList } from './Strip';

const meta = {
  title: 'Movement/ActivityStrip',
  component: ActivityStrip,
  args: {
    activity: 'Beach volleyball',
    time: '7:00',
    place: 'Parc Jarry · 4 km',
    count: 5,
    capacity: 8,
    status: 'forming',
  },
  argTypes: {
    status: { control: { type: 'select' }, options: [...ACTIVITY_STATUSES] },
    count: { control: { type: 'number' } },
    capacity: { control: { type: 'number' } },
  },
} satisfies Meta<typeof ActivityStrip>;

export default meta;

type Story = StoryObj<typeof meta>;

/** States › Expired: forming, the count boxed "5 / 8". */
export const Forming: Story = {};

/** GAME ON in a signal badge. */
export const Confirmed: Story = {
  args: {
    activity: '5K river run',
    time: '6:30',
    place: 'Lachine Canal · 4 km',
    status: 'confirmed',
  },
};

/** LIVE: oxblood pill, white ring, pulsing dot (still under reduced motion). */
export const Live: Story = {
  args: {
    activity: 'Sparring rounds',
    time: 'NOW',
    place: 'Hoshino Boxing · 2.8 km',
    status: 'live',
  },
};

/** States › Couldn't join: FULL. */
export const Full: Story = {
  args: { activity: 'Pickup football', time: '7:30', place: 'Jeanne-Mance Park', status: 'full' },
};

const rows = (
  <StripList>
    <ActivityStrip
      activity="Sparring rounds"
      time="NOW"
      place="Hoshino Boxing · 2.8 km"
      status="live"
      onPress={() => {}}
    />
    <ActivityStrip
      activity="5K river run"
      time="6:30"
      place="Lachine Canal · 4 km"
      status="confirmed"
      onPress={() => {}}
    />
    <ActivityStrip
      activity="Pickup football"
      time="7:30"
      place="Jeanne-Mance Park · 1.2 km"
      count={6}
      capacity={8}
      onPress={() => {}}
    />
    <ActivityStrip
      activity="Pickup football"
      time="7:30"
      place="Jeanne-Mance Park"
      status="full"
      onPress={() => {}}
    />
  </StripList>
);

/** Strips stack on `line` hairlines under a labelled divider, never as cards. */
export const Stack: Story = {
  render: () => (
    <View className="gap-space-2">
      <Divider label="TONIGHT" />
      {rows}
    </View>
  ),
};

/** Every status on every ground it appears on. */
export const OnEachSituation: Story = {
  render: () => (
    <EachSituation only={['calm', 'forming', 'confirmed', 'live']}>{rows}</EachSituation>
  ),
  parameters: { ojoro: { padded: false } },
};

/** The four statuses, 16pt apart like the web harness's item list, on one ground. */
function AllStatuses() {
  return (
    <View>
      {(
        [
          {
            activity: 'Beach volleyball',
            time: '7:00',
            place: 'Parc Jarry · 4 km',
            count: 5,
            capacity: 8,
          },
          {
            activity: '5K river run',
            time: '6:30',
            place: 'Lachine Canal · 4 km',
            status: 'confirmed',
          },
          {
            activity: 'Sparring rounds',
            time: 'NOW',
            place: 'Hoshino Boxing · 2.8 km',
            status: 'live',
          },
          { activity: 'Pickup football', time: '7:30', place: 'Jeanne-Mance Park', status: 'full' },
        ] as const
      ).map((row) => (
        <View key={row.activity} className="mb-space-4">
          <ActivityStrip {...row} />
        </View>
      ))}
    </View>
  );
}

/** All statuses on calm (Discover, Home). */
export const AllStatusesCalm: Story = { render: () => <AllStatuses /> };

/** All statuses on forming (inside a plan screen). */
export const AllStatusesForming: Story = {
  render: () => <AllStatuses />,
  parameters: onSituation('forming'),
};

/** All statuses on confirmed (game day). */
export const AllStatusesConfirmed: Story = {
  render: () => <AllStatuses />,
  parameters: onSituation('confirmed'),
};
