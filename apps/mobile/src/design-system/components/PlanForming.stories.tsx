import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { EachSituation, Section } from '../stories/storyKit';
import { useThemeColor } from '../useThemeColor';
import { Button } from './Button';
import { Icon } from './Icon';
import { PlanForming, PLAN_VARIANTS, type PlanFormingProps } from './PlanForming';
import type { Person } from './AvatarCluster';
import { loadingProps, Skeleton } from './Skeleton';
import { Text } from './Text';
import { Toast } from './Toast';

/** Sample content from the Plan and States designs. Never inside the component. */
const PEOPLE: Person[] = [
  { name: 'Ade B' },
  { name: 'Chimdi O' },
  { name: 'Marcus T' },
  { name: 'Lena R' },
  { name: 'Sam K' },
  { name: 'Yara M' },
  { name: 'Theo L' },
  { name: 'Nia P' },
];

const FOOTBALL = {
  activity: 'Football',
  capacity: 8,
  time: 'Tonight 7:30',
  place: 'Jeanne-Mance Park',
} as const;

const at = (count: number, extra?: Partial<PlanFormingProps>): PlanFormingProps => ({
  ...FOOTBALL,
  count,
  participants: PEOPLE.slice(0, count),
  joined: false,
  ...extra,
});

const meta = {
  title: 'Movement/PlanForming',
  component: PlanForming,
  args: at(6, { joined: true }),
  argTypes: {
    variant: { control: { type: 'select' }, options: [undefined, ...PLAN_VARIANTS] },
    privacy: { control: { type: 'select' }, options: [undefined, 'open', 'crew', 'invite'] },
    count: { control: { type: 'number' } },
    capacity: { control: { type: 'number' } },
    joined: { control: { type: 'boolean' } },
    expired: { control: { type: 'boolean' } },
  },
} satisfies Meta<typeof PlanForming>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Plan: 6 / 8, 2 MORE, two open spots, YOU'RE DOWN. The plan sets forming on its own root. */
export const Almost: Story = {};

/** Under 50%: early. I'M DOWN not yet pressed. */
export const Early: Story = { args: at(2) };

/** 50–75%: viable. */
export const Viable: Story = { args: at(4) };

/** One short: NEED ONE MORE at display-md, and PULL SOMEONE IN instead of I'M DOWN. */
export const NeedOneMore: Story = { args: at(7, { joined: true }) };

/** Full: the object turns confirmed. CONFIRMED · GAME ON · OPEN GAME. */
export const GameOn: Story = { args: at(8, { joined: true }) };

/** Didn't come together: calm, dimmed to opacity-expired, EXPIRED, no button. */
const EXPIRED: PlanFormingProps = {
  activity: 'Volleyball',
  count: 3,
  capacity: 8,
  participants: PEOPLE.slice(0, 3),
  time: 'Last night 8:00',
  place: 'Parc La Fontaine',
  expired: true,
};

export const Expired: Story = { args: EXPIRED };

/** All six variants in a calm feed: each object sets its own situation. */
export const Variants: Story = {
  render: () => (
    <View className="gap-space-6">
      {([2, 4, 6, 7, 8] as const).map((n) => (
        <PlanForming key={n} {...at(n, { joined: n >= 6 })} />
      ))}
      <PlanForming {...EXPIRED} />
    </View>
  ),
};

/** The commit button before and after: I'M DOWN → YOU'RE DOWN. */
export const Joined: Story = {
  render: () => (
    <View className="gap-space-6">
      <PlanForming {...at(5)} />
      <PlanForming {...at(6, { joined: true })} />
    </View>
  ),
};

/**
 * Gather and Breakthrough. Press I'M DOWN (you join: 6 → 7), then SOMEONE JOINS
 * (7 → 8): the confirmed ground wipes down, GAME ON scales in, success haptic.
 * Turn on reduced motion to see the 120ms cross-fade instead.
 */
export const Interactive: Story = {
  render: function InteractiveStory() {
    const [people, setPeople] = useState<Person[]>(PEOPLE.slice(0, 6));
    const [joined, setJoined] = useState(false);
    const count = people.length;
    const join = (person: Person) =>
      setPeople((current) =>
        // Newest first, so the one who just joined is in view and gathers in.
        current.length >= 8
          ? current
          : [{ ...person, isNew: true }, ...current.map((p) => ({ ...p, isNew: false }))],
      );
    return (
      <View className="gap-space-4">
        <PlanForming
          {...FOOTBALL}
          count={count}
          participants={people}
          joined={joined}
          onJoin={() => {
            if (joined) return;
            setJoined(true);
            join({ name: 'You' });
          }}
          onInvite={() => join(PEOPLE[count] ?? { name: 'Friend' })}
          onOpen={() => {}}
        />
        <View className="flex-row flex-wrap gap-space-3">
          <Button
            variant="secondary"
            disabled={count >= 8}
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
        <Text variant="body-sm" muted>
          {`${count} / 8 · ${joined ? "you're down" : 'not down yet'}`}
        </Text>
      </View>
    );
  },
};

function MutedClock() {
  return <Icon name="clock" size={16} color={useThemeColor('text-muted')} />;
}

/** The spec's states: loading (skeleton after 300ms), offline (last count + age), full, error. */
export const States: Story = {
  render: () => (
    <View>
      <Section title="LOADING">
        <View {...loadingProps('Loading plan')}>
          <Skeleton kind="object" delay={0} />
        </View>
      </Section>
      <Section title="OFFLINE · LAST KNOWN COUNT">
        <View className="gap-space-3">
          <PlanForming {...at(6, { joined: true })} />
          <View className="flex-row items-center gap-[6px]">
            <MutedClock />
            <Text variant="caption" muted>
              Count as of 7:02 PM
            </Text>
          </View>
          <Toast
            kind="offline"
            message="Offline. Showing the last count from 7:02."
            announce={false}
          />
        </View>
      </Section>
      <Section title="FULL">
        <PlanForming {...at(8, { joined: false })} />
      </Section>
      <Section title="ERROR">
        <View className="gap-space-3">
          <PlanForming {...at(7)} />
          <Toast
            kind="error"
            message="Couldn't join. The last spot went a moment before you."
            action="WAITLIST"
            announce={false}
          />
        </View>
      </Section>
    </View>
  ),
};

/** On each ground it appears in: calm feed, forming plan screen, after (history). */
export const OnEachSituation: Story = {
  render: () => (
    <EachSituation only={['calm', 'forming', 'after']}>
      <PlanForming {...at(6, { joined: true })} />
    </EachSituation>
  ),
  parameters: { ojoro: { padded: false } },
};
