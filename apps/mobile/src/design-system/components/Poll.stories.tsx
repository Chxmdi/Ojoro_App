import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { EachSituation, onSituation, Section } from '../stories/storyKit';
import { Poll } from './Poll';

const times = [
  { label: '7:30', votes: 4 },
  { label: '8:00', votes: 2 },
];

const saturday = [
  { label: 'Sat 9:00', votes: 5 },
  { label: 'Sat 10:30', votes: 3 },
  { label: 'Sun 9:00', votes: 1 },
];

const meta = {
  title: 'Social/Poll',
  component: Poll,
  args: { question: 'WHAT TIME?', options: times, closes: 'at 6:00', testID: 'poll' },
  argTypes: {
    voted: { control: { type: 'number' } },
    closed: { control: { type: 'boolean' } },
    closes: { control: { type: 'text' } },
  },
  parameters: onSituation('forming'),
} satisfies Meta<typeof Poll>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Open: option buttons in a radio group. */
export const Open: Story = { args: { onVote: () => {} } };

/** Plan › WHAT TIME?: voted, results with fills and percentages, your vote checked and outlined. */
export const Voted: Story = { args: { voted: 0 } };

/** Closed: results for everyone, no check, "Closed". */
export const Closed: Story = { args: { voted: 0, closed: true } };

/** Tap an option: it records your vote and shows the results. */
export const InteractiveVoting: Story = {
  render: function Render() {
    const [voted, setVoted] = useState<number | undefined>(undefined);
    const options = saturday.map((o, i) => ({ ...o, votes: o.votes + (voted === i ? 1 : 0) }));
    return (
      <Poll
        question="WHAT TIME SATURDAY?"
        options={options}
        voted={voted}
        closes="tonight 9 PM"
        onVote={setVoted}
      />
    );
  },
};

/** Open, voted and closed on calm (CrewChat) and forming (Plan, EventBuildup). */
export const Situations: Story = {
  parameters: { ojoro: { padded: false } },
  render: () => (
    <EachSituation only={['calm', 'forming']}>
      <View>
        <Section title="Open">
          <Poll
            question="WHERE?"
            closes="tonight 9 PM"
            options={[
              { label: 'Jeanne-Mance Park', votes: 3 },
              { label: 'Parc Jarry', votes: 2 },
            ]}
            onVote={() => {}}
          />
        </Section>
        <Section title="Voted">
          <Poll question="WHAT TIME SATURDAY?" voted={0} closes="tonight 9 PM" options={saturday} />
        </Section>
        <Section title="Closed">
          <Poll
            question="ANYONE UNDER 23 MINUTES?"
            closed
            options={[
              { label: 'Yes', votes: 9 },
              { label: 'No', votes: 12 },
            ]}
          />
        </Section>
      </View>
    </EachSituation>
  ),
};

/** No votes yet: 0 percent everywhere, "0 votes". */
export const NoVotes: Story = {
  args: {
    closed: true,
    options: [
      { label: '7:30', votes: 0 },
      { label: '8:00', votes: 0 },
    ],
  },
};
