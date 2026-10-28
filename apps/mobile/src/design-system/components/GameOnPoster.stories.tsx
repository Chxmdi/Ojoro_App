import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { EachSituation, onSituation, Section } from '../stories/storyKit';
import type { Person } from './AvatarCluster';
import { Button } from './Button';
import { GameOnPoster } from './GameOnPoster';
import { ReducedMotionOverride } from './Overlay';
import { Text } from './Text';

/** Sample content from the GameOn design. Never inside the component. */
const PEOPLE: Person[] = [
  { name: 'Ade B' },
  { name: 'Chimdi O' },
  { name: 'Marcus T' },
  { name: 'Lena R' },
  { name: 'Sam K' },
  { name: 'Yara M' },
  { name: 'Tolu D' },
  { name: 'Joel P' },
];

const meta = {
  title: 'Movement/GameOnPoster',
  component: GameOnPoster,
  args: {
    activity: 'Football',
    time: 'Tonight 7:30',
    place: 'Jeanne-Mance Park',
    count: 8,
    people: PEOPLE,
    celebrate: false,
  },
  argTypes: {
    count: { control: { type: 'number' } },
    celebrate: { control: { type: 'boolean' } },
  },
  parameters: { ojoro: { padded: false } },
} satisfies Meta<typeof GameOnPoster>;

export default meta;

type Story = StoryObj<typeof meta>;

/** GameOn screen: CONFIRMED · 8 IN, GAME ON at the poster hero size, WHAT / WHEN / WHERE, everyone in. */
export const Default: Story = {};

/** On the GameOn takeover itself: the screen is confirmed too, so the poster runs edge to edge. */
export const OnConfirmedScreen: Story = { parameters: onSituation('confirmed', { padded: false }) };

/** No people: no cluster. No count: the overline drops the count. */
export const Minimal: Story = { args: { people: undefined, count: undefined } };

/** More people than fit: eight avatars, then +N. Long place names wrap in their column. */
export const LongContent: Story = {
  args: {
    activity: 'Beach volleyball',
    time: 'Sat 10:00',
    place: 'Parc La Fontaine courts',
    count: 12,
    people: [...PEOPLE, { name: 'Ife N' }, { name: 'Tomi A' }],
  },
};

/** The poster sets confirmed on its own root: oxblood inside a calm feed, an after page, anywhere. */
export const OnEachSituation: Story = {
  render: (args) => (
    <EachSituation only={['calm', 'forming', 'after']}>
      <GameOnPoster {...args} />
    </EachSituation>
  ),
};

/** A narrower container (320): the hero follows the width, 29% of the content box (79 here), never below 64. */
export const Narrow: Story = {
  render: (args) => (
    <View style={{ width: 320 }}>
      <GameOnPoster {...args} />
    </View>
  ),
  parameters: { ojoro: { padded: true } },
};

function Replay({ reduced }: { reduced: boolean | null }) {
  const [run, setRun] = useState(0);
  return (
    <ReducedMotionOverride value={reduced}>
      <View className="gap-space-4">
        <Section title={reduced ? 'REDUCED MOTION · 120MS CROSS-FADE' : 'BREAKTHROUGH · 600MS'}>
          <Button variant="secondary" onPress={() => setRun((n) => n + 1)}>
            REPLAY
          </Button>
        </Section>
        {/* Remounting with `celebrate` replays the entrance, the success haptic and the announcement. */}
        <GameOnPoster
          key={run}
          activity="Football"
          time="Tonight 7:30"
          place="Jeanne-Mance Park"
          count={8}
          people={PEOPLE.map((p, i) => (i === 7 ? { ...p, isNew: true } : p))}
          celebrate
        />
        <Text variant="body-sm" muted>
          {`Played ${run + 1} ${run === 0 ? 'time' : 'times'}.`}
        </Text>
      </View>
    </ReducedMotionOverride>
  );
}

/**
 * Celebrate: the poster arrives via Breakthrough (the confirmed ground wipes
 * down, GAME ON scales in) with the success haptic. Press REPLAY to run it again.
 */
export const Celebrate: Story = {
  render: () => <Replay reduced={null} />,
  parameters: { ojoro: { padded: true } },
};

/** Reduced motion forced on: a 120ms cross-fade; GAME ON is there from the first frame. */
export const CelebrateReducedMotion: Story = {
  render: () => <Replay reduced />,
  parameters: { ojoro: { padded: true } },
};
