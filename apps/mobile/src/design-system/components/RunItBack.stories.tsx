import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { EachSituation, onSituation } from '../stories/storyKit';
import type { Person } from './AvatarCluster';
import { RunItBack } from './RunItBack';
import { Text } from './Text';

/** Sample content from the RunItBack design. Never inside the component. */
const PEOPLE: Person[] = [
  { name: 'Ade B' },
  { name: 'Chimdi O' },
  { name: 'Marcus T' },
  { name: 'Joel P' },
  { name: 'Lena R' },
  { name: 'Sam K' },
  { name: 'Yara M' },
  { name: 'Tolu D' },
];

const meta = {
  title: 'Movement/RunItBack',
  component: RunItBack,
  args: {
    activity: 'Football',
    crew: 'Thursday FC + 2',
    lastDate: 'TUE 6 OCT',
    count: 8,
    suggested: 'Tue 13 Oct, 7:30 at Jeanne-Mance',
    people: PEOPLE,
  },
  argTypes: { count: { control: { type: 'number' } } },
  parameters: { ojoro: { padded: false } },
} satisfies Meta<typeof RunItBack>;

export default meta;

type Story = StoryObj<typeof meta>;

/** RunItBack screen: the after situation on its own root, seven avatars then +1, RUN IT BACK and CHANGE TIME. */
export const Default: Story = {};

/** On the RunItBack screen, whose page is after as well. */
export const OnAfterScreen: Story = { parameters: onSituation('after', { padded: false }) };

/** A small game: three played, no +N. */
export const Small: Story = {
  args: {
    activity: 'Tennis',
    crew: 'Lena and Sam',
    lastDate: 'SAT 3 OCT',
    count: 3,
    suggested: 'Sat 10 Oct, 9:00 at Jarry',
    people: PEOPLE.slice(4, 7),
  },
};

/**
 * Tap RUN IT BACK: Commit (0.96 press) and the light haptic. The feature then
 * opens a NEW plan with the same people invited: nobody is in until they tap
 * I'M DOWN (the button's accessibility hint says so).
 */
export const Interactive: Story = {
  render: function InteractiveStory(args) {
    const [log, setLog] = useState('Nothing yet.');
    return (
      <View className="gap-space-4">
        <RunItBack
          {...args}
          onRun={() => setLog('New plan opened for Tue 13 Oct, 7:30. 0 in, 8 invited.')}
          onChange={() => setLog('Pick another time.')}
        />
        <View className="px-space-5">
          <Text variant="body-sm" muted>
            {log}
          </Text>
        </View>
      </View>
    );
  },
};

/** It sets after on its own root, so it reads the same inside a calm Home feed. */
export const OnEachSituation: Story = {
  render: (args) => (
    <EachSituation only={['calm', 'after']}>
      <RunItBack {...args} />
    </EachSituation>
  ),
};
