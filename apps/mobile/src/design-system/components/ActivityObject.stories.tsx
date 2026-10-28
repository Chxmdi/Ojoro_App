import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { EachSituation, Section } from '../stories/storyKit';
import { useThemeColor } from '../useThemeColor';
import {
  ActivityObject,
  ACTIVITY_OBJECT_STATUSES,
  type ActivityObjectProps,
} from './ActivityObject';
import type { Person } from './AvatarCluster';
import { Button } from './Button';
import { Icon } from './Icon';
import { ReducedMotionOverride } from './Overlay';
import { loadingProps, Skeleton } from './Skeleton';
import { Text } from './Text';
import { Toast } from './Toast';

/** Sample content from the Activity design. Never inside the component. */
const PEOPLE: Person[] = [
  { name: 'Ade B' },
  { name: 'Chimdi O' },
  { name: 'Marcus T' },
  { name: 'Joel P' },
  { name: 'Lena R' },
  { name: 'Sam K' },
  { name: 'Yara M' },
  { name: 'Tolu D' },
  { name: 'Ife N' },
  { name: 'Tomi A' },
];

const FOOTBALL = {
  activity: 'Pickup football',
  day: 'TONIGHT',
  time: '7:30',
  place: 'Jeanne-Mance Park',
  distance: '1.2 km',
  level: 'Mixed level',
} as const;

const at = (
  count: number,
  capacity: number,
  extra?: Partial<ActivityObjectProps>,
): ActivityObjectProps => ({
  ...FOOTBALL,
  count,
  capacity,
  people: PEOPLE.slice(0, count),
  ...extra,
});

const meta = {
  title: 'Movement/ActivityObject',
  component: ActivityObject,
  args: at(6, 10),
  argTypes: {
    status: { control: { type: 'select' }, options: [...ACTIVITY_OBJECT_STATUSES] },
    count: { control: { type: 'number' } },
    capacity: { control: { type: 'number' } },
    joined: { control: { type: 'boolean' } },
    details: { control: { type: 'boolean' } },
  },
  parameters: { ojoro: { padded: false } },
} satisfies Meta<typeof ActivityObject>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Forming: calm ground, "6 / 10" badge, two open spots, DETAILS and I'M DOWN. */
export const Forming: Story = {};

/** Forming and in: YOU'RE DOWN. */
export const FormingJoined: Story = { args: at(7, 10, { joined: true }) };

/** Activity screen: confirmed on its own root, GAME ON badge, no DETAILS on the activity's own page. */
export const Confirmed: Story = { args: at(8, 8, { status: 'confirmed', details: false }) };

/** Confirmed in a list: DETAILS stays. */
export const ConfirmedWithDetails: Story = { args: at(8, 8, { status: 'confirmed' }) };

/** Live: the live situation (black) and the LIVE pill, ringed white. */
export const Live: Story = { args: at(8, 8, { status: 'live', day: 'NOW' }) };

/** Every variant in a calm feed: each object sets its own situation. */
export const Variants: Story = {
  render: () => (
    <View className="gap-space-6">
      <ActivityObject {...at(6, 10)} />
      <ActivityObject {...at(7, 10, { joined: true })} />
      <ActivityObject {...at(8, 8, { status: 'confirmed' })} />
      <ActivityObject {...at(8, 8, { status: 'live', day: 'NOW' })} />
      <ActivityObject {...at(10, 10)} />
    </View>
  ),
};

/** No distance, no level, short name: the meta line holds just the place. */
export const Minimal: Story = {
  args: {
    activity: 'Run',
    day: 'THU',
    time: '6:30',
    place: 'Lachine Canal',
    count: 2,
    capacity: 6,
    people: PEOPLE.slice(0, 2),
  },
};

function JoinFlow({ reduced }: { reduced: boolean | null }) {
  const [people, setPeople] = useState<Person[]>(PEOPLE.slice(0, 6));
  const [joined, setJoined] = useState(false);
  const capacity = 8;
  const count = people.length;
  const join = (person: Person) =>
    setPeople((current) =>
      current.length >= capacity
        ? current
        : [{ ...person, isNew: true }, ...current.map((p) => ({ ...p, isNew: false }))],
    );
  return (
    <ReducedMotionOverride value={reduced}>
      <View className="gap-space-4">
        <ActivityObject
          {...FOOTBALL}
          count={count}
          capacity={capacity}
          people={people}
          joined={joined}
          status={count >= capacity ? 'confirmed' : 'forming'}
          onJoin={() => {
            if (joined) return;
            setJoined(true);
            join({ name: 'You' });
          }}
          onOpen={() => {}}
        />
        <View className="flex-row flex-wrap gap-space-3 px-space-5">
          <Button
            variant="secondary"
            disabled={count >= capacity}
            onPress={() =>
              join(PEOPLE.find((p) => !people.some((q) => q.name === p.name)) ?? { name: 'Friend' })
            }
          >
            SOMEONE JOINS
          </Button>
          <Button
            variant="ghost"
            onPress={() => {
              setPeople(PEOPLE.slice(0, 6));
              setJoined(false);
            }}
          >
            RESET
          </Button>
        </View>
      </View>
    </ReducedMotionOverride>
  );
}

/**
 * Gather and Breakthrough. I'M DOWN (6 → 7, light haptic, your avatar gathers
 * in), then SOMEONE JOINS (7 → 8): the confirmed ground wipes down, GAME ON,
 * success haptic.
 */
export const Interactive: Story = { render: () => <JoinFlow reduced={null} /> };

/** The same with reduced motion forced on: a 120ms cross-fade; the badge still changes to GAME ON. */
export const InteractiveReducedMotion: Story = { render: () => <JoinFlow reduced /> };

function AsOf({ text }: { text: string }) {
  const muted = useThemeColor('text-muted');
  return (
    <View className="flex-row items-center gap-[6px] px-space-5">
      <Icon name="clock" size={16} color={muted} />
      <Text variant="caption" muted>
        {text}
      </Text>
    </View>
  );
}

/** The spec's states: loading (Skeleton object), offline (count frozen, Toast), full, error. */
export const States: Story = {
  render: () => (
    <View>
      <Section title="LOADING">
        <View className="px-space-5" {...loadingProps('Loading activity')}>
          <Skeleton kind="object" delay={0} />
        </View>
      </Section>
      <Section title="OFFLINE · COUNT FROZEN">
        <View className="gap-space-3">
          <ActivityObject {...at(6, 10, { joined: true })} />
          <AsOf text="Count as of 7:02 PM" />
          <View className="px-space-5">
            <Toast
              kind="offline"
              message="Offline. Showing the last count from 7:02."
              announce={false}
            />
          </View>
        </View>
      </Section>
      <Section title="FULL">
        <View className="gap-space-6">
          <ActivityObject {...at(10, 10)} />
          <ActivityObject {...at(10, 10, { joined: true })} />
        </View>
      </Section>
      <Section title="ERROR">
        <View className="gap-space-3">
          <ActivityObject {...at(9, 10)} />
          <View className="px-space-5">
            <Toast
              kind="error"
              message="Couldn't join. The last spot went a moment before you."
              action="WAITLIST"
              announce={false}
            />
          </View>
        </View>
      </Section>
    </View>
  ),
};

/** Forming takes the page's calm ground; on a forming or after page it still sets calm on its root. */
export const OnEachSituation: Story = {
  render: () => (
    <EachSituation only={['calm', 'forming', 'after']}>
      <ActivityObject {...at(6, 10)} />
    </EachSituation>
  ),
};
