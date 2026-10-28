import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { EachSituation, Section } from '../stories/storyKit';
import type { Person } from './AvatarCluster';
import { Button } from './Button';
import { DownFor } from './DownFor';
import { loadingProps, Skeleton } from './Skeleton';
import { Toast } from './Toast';

/** Sample content from the Home (Main) design. Never inside the component. */
const PEOPLE: Person[] = [
  { name: 'Ade B' },
  { name: 'Marcus T' },
  { name: 'Lena R' },
  { name: 'Sam K' },
  { name: 'Yara M' },
  { name: 'Joel P' },
  { name: 'Ife N' },
  { name: 'Tomi A' },
];

const FOOTBALL = {
  activity: 'Football',
  when: 'tonight',
  where: 'Jeanne-Mance Park · around 7:30 · 1.2 km',
} as const;

const meta = {
  title: 'Movement/DownFor',
  component: DownFor,
  args: { ...FOOTBALL, downCount: 11, downs: PEOPLE, committed: false },
  argTypes: {
    downCount: { control: { type: 'number' } },
    committed: { control: { type: 'boolean' } },
  },
} satisfies Meta<typeof DownFor>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Home: FOOTBALL TONIGHT?, 11 down, I'M DOWN. */
export const Default: Story = {};

/** After I'M DOWN: YOU'RE DOWN with the check, on an outlined ground. */
export const Committed: Story = {
  args: { committed: true, downCount: 12, downs: [{ name: 'You' }, ...PEOPLE] },
};

/** Nobody yet: no avatars, 0 down. The question still stands. */
export const NobodyYet: Story = {
  args: {
    activity: 'Tennis',
    when: 'Saturday',
    where: 'Jarry Park courts · morning · 3 km',
    downCount: 0,
    downs: [],
  },
};

/** One person: "1 down", spoken "1 person down." */
export const One: Story = { args: { downCount: 1, downs: PEOPLE.slice(0, 1) } };

/**
 * Committing: press I'M DOWN. Commit (0.96 press) and the light haptic, the
 * label locks to YOU'RE DOWN, your avatar gathers into the cluster and the
 * count ticks 11 → 12. RESET to try again.
 */
export const Interactive: Story = {
  render: function InteractiveStory() {
    const [committed, setCommitted] = useState(false);
    const downs = committed ? [{ name: 'You', isNew: true }, ...PEOPLE] : PEOPLE;
    return (
      <View className="gap-space-6">
        <DownFor
          {...FOOTBALL}
          downCount={committed ? 12 : 11}
          downs={downs}
          committed={committed}
          onDown={() => setCommitted(true)}
        />
        <Button variant="ghost" onPress={() => setCommitted(false)}>
          RESET
        </Button>
      </View>
    );
  },
};

/** Loading (skeleton after 300ms), offline (last count, how old), error. */
export const States: Story = {
  render: () => (
    <View>
      <Section title="LOADING">
        <View {...loadingProps('Loading Down For')}>
          <Skeleton kind="object" delay={0} />
        </View>
      </Section>
      <Section title="OFFLINE · LAST KNOWN COUNT">
        <View className="gap-space-3">
          <DownFor {...FOOTBALL} downCount={11} downs={PEOPLE} />
          <Toast kind="offline" message="Offline. Showing who was down at 6:40." announce={false} />
        </View>
      </Section>
      <Section title="ERROR">
        <View className="gap-space-3">
          <DownFor {...FOOTBALL} downCount={11} downs={PEOPLE} />
          <Toast
            kind="error"
            message="Couldn't save that. You're not down yet."
            action="TRY AGAIN"
            announce={false}
          />
        </View>
      </Section>
    </View>
  ),
};

/** No card and no situation of its own: it reads on the page's ground (calm Home, forming, after). */
export const OnEachSituation: Story = {
  render: (args) => (
    <EachSituation only={['calm', 'forming', 'after']}>
      <DownFor {...args} />
    </EachSituation>
  ),
  parameters: { ojoro: { padded: false } },
};
