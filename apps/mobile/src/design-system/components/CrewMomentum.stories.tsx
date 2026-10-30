import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';

import { EachSituation, onSituation } from '../stories/storyKit';
import { CrewMomentum } from './CrewMomentum';

const members = [
  { name: 'Ade B' },
  { name: 'Lena R' },
  { name: 'Joel P' },
  { name: 'Sam K' },
  { name: 'Marcus T' },
  { name: 'Chimdi O' },
];

const meta = {
  title: 'Communities/CrewMomentum',
  component: CrewMomentum,
  parameters: onSituation('calm'),
  args: {
    crew: 'Thursday FC',
    memberCount: 14,
    members,
    weeks: [3, 4, 2, 5, 6, 4, 6, 7],
    streak: 6,
    next: 'Football · Thu 7:30 · Jeanne-Mance',
    onDown: () => {},
    joined: false,
  },
  argTypes: { joined: { control: { type: 'boolean' } }, joining: { control: { type: 'boolean' } } },
} satisfies Meta<typeof CrewMomentum>;

export default meta;

type Story = StoryObj<typeof meta>;

/** CrewHome header: CREW · 14, faces, rhythm, NEXT with I'M DOWN. */
export const Default: Story = {};

/** Already in the next plan: YOU'RE DOWN. */
export const Joined: Story = { args: { joined: true } };

/** The join is in flight: the label stays, a spinner shows. */
export const Joining: Story = { args: { joining: true } };

/** Nothing on next: no NEXT row. */
export const NothingNext: Story = { args: { next: undefined } };

/** Viewing someone else's crew (no `onDown`): NEXT without the button. */
export const ViewOnly: Story = {
  render: ({ onDown: _onDown, ...rest }) => <CrewMomentum {...rest} />,
};

/** A brand-new crew of two: few faces, no history. */
export const NewCrew: Story = {
  args: { crew: 'Sunday Swim', memberCount: 2, members: members.slice(0, 2), weeks: [], streak: 0 },
};

/** A long name wraps; it never truncates. */
export const LongName: Story = { args: { crew: 'Mile End Wednesday Night Runners' } };

function Interactive() {
  const [joined, setJoined] = useState(false);
  return (
    <CrewMomentum
      crew="Thursday FC"
      memberCount={14}
      members={members}
      weeks={[3, 4, 2, 5, 6, 4, 6, joined ? 8 : 7]}
      streak={6}
      next="Football · Thu 7:30 · Jeanne-Mance"
      joined={joined}
      onDown={() => setJoined(true)}
    />
  );
}

/** Tap I'M DOWN: the button locks to YOU'RE DOWN and this week's bar grows. */
export const Interaction: Story = { render: () => <Interactive /> };

/** On each ground a crew can appear on. */
export const OnEachSituation: Story = {
  parameters: { ojoro: { padded: false } },
  render: (args) => (
    <EachSituation only={['calm', 'forming', 'after']}>
      <CrewMomentum {...args} />
    </EachSituation>
  ),
};
