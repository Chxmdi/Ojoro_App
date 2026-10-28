import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { EachSituation, onSituation } from '../stories/storyKit';
import { Comment } from './Comment';

const meta = {
  title: 'Social/Comment',
  component: Comment,
  args: {
    author: 'Marcus T',
    time: '4m',
    body: 'Running 5 late. Start without me.',
    respect: 2,
    testID: 'comment',
  },
  argTypes: {
    respect: { control: { type: 'number' } },
    replies: { control: { type: 'number' } },
    respected: { control: { type: 'boolean' } },
    reply: { control: { type: 'boolean' } },
    badge: { control: { type: 'text' } },
  },
} satisfies Meta<typeof Comment>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A reply with a badge: indented one level. */
export const Reply: Story = {
  args: {
    badge: 'COMPETITOR',
    time: '8m',
    body: "Mornings don't win races.",
    respect: 31,
    reply: true,
  },
};

/** Activity: the thread under a game, on calm. */
export const ActivityThread: Story = {
  render: () => (
    <View>
      <Comment
        author="Ade B"
        badge="HOST"
        time="12m"
        body="Bibs are in the car. North pitch, by the lights."
      />
      <Comment author="Marcus T" time="4m" body="Running 5 late. Start without me." respect={2} />
    </View>
  ),
};

/** EventBuildup: respected with a count, replies, and one reply indented one level, on forming. */
export const BuildUp: Story = {
  parameters: onSituation('forming'),
  render: () => (
    <View>
      <Comment
        author="Ade B"
        time="12m"
        body="Chimdi's been out on Mount Royal every morning. Just saying."
        respect={14}
        respected
        replies={3}
      />
      <Comment
        author="Marcus T"
        badge="COMPETITOR"
        time="8m"
        body="Mornings don't win races."
        respect={31}
        reply
      />
    </View>
  ),
};

/** RESPECT toggles to RESPECTED (underlined, full text colour) and counts up. */
export const InteractiveRespect: Story = {
  render: () => {
    const [on, setOn] = useState(false);
    return (
      <Comment
        author="Lena R"
        time="1m"
        body="Marcus always finishes fast. Not over yet."
        respect={4 + (on ? 1 : 0)}
        respected={on}
        onRespect={() => setOn((v) => !v)}
        onReply={() => {}}
      />
    );
  },
};

/** On calm, forming and live (EventLive). */
export const Situations: Story = {
  parameters: { ojoro: { padded: false } },
  render: () => (
    <EachSituation only={['calm', 'forming', 'live']}>
      <Comment
        author="Ade B"
        time="now"
        body="He's pulling away on the climb!"
        respect={9}
        respected
        replies={1}
      />
      <Comment author="Marcus T" badge="COMPETITOR" time="1m" body="Not over yet." reply />
    </EachSituation>
  ),
};
