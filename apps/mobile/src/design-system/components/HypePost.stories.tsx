import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { EachSituation, onSituation } from '../stories/storyKit';
import { Comment } from './Comment';
import { Divider } from './Divider';
import { HYPE_POST_KINDS, HypePost } from './HypePost';

const meta = {
  title: 'Competition/HypePost',
  component: HypePost,
  parameters: onSituation('forming'),
  args: {
    kind: 'competitor',
    author: 'Chimdi O',
    side: 'CHIMDI',
    time: '1d',
    body: 'Rain or not, Saturday I run it.',
    testID: 'post',
  },
  argTypes: {
    kind: { control: { type: 'select' }, options: [...HYPE_POST_KINDS] },
  },
} satisfies Meta<typeof HypePost>;

export default meta;

type Story = StoryObj<typeof meta>;

/** EventBuildup: a competitor, `md` avatar, signal badge, 18/26 body. */
export const Competitor: Story = {};

/** EventBuildup: training evidence with its stats block. */
export const Evidence: Story = {
  args: {
    kind: 'evidence',
    author: 'Marcus T',
    side: 'MARCUS',
    time: '3h',
    body: 'Last tempo run before Saturday.',
    stats: [
      { value: '5.2 KM', label: 'distance' },
      { value: '23:48', label: 'time' },
    ],
  },
};

/** A supporter: `sm` avatar, neutral badge. */
export const Supporter: Story = {
  args: {
    kind: 'supporter',
    author: 'Ade B',
    side: 'CHIMDI',
    time: '20m',
    body: 'Mount Royal at 6am, every day. Just saying.',
  },
};

/** Ojoro's update: inverse strip, display headline. White on the live ground. */
export const System: Story = {
  parameters: onSituation('live'),
  args: {
    kind: 'system',
    time: '8:01',
    body: 'GOAL · MARCUS. LIGHTS LEAD 3–2.',
    author: undefined,
    side: undefined,
  },
};

/** A person's post with the overflow for report and block. */
export const WithOverflow: Story = {
  args: { onMore: () => {} },
};

/** LiveActivity's UPDATES section: two Ojoro updates and a comment, on live. */
export const LiveActivityFeed: Story = {
  parameters: onSituation('live'),
  render: () => (
    <View className="gap-space-2">
      <Divider label="UPDATES" />
      <HypePost kind="system" time="8:01" body="GOAL · MARCUS. LIGHTS LEAD 3–2." />
      <HypePost kind="system" time="7:52" body="HALF TIME. 2–2." />
      <Comment author="Yara M" time="1m" body="Darks need one more. Joel is everywhere." />
    </View>
  ),
};

/** EventBuildup's feed, in order, on forming. */
export const BuildUpFeed: Story = {
  render: () => (
    <View>
      <HypePost kind="system" time="1H AGO" body="THE CROWD IS CHANGING ITS MIND." />
      <HypePost
        kind="evidence"
        author="Marcus T"
        side="MARCUS"
        time="3h"
        body="Last tempo run before Saturday."
        stats={[
          { value: '5.2 KM', label: 'distance' },
          { value: '23:48', label: 'time' },
        ]}
      />
      <HypePost
        kind="competitor"
        author="Chimdi O"
        side="CHIMDI"
        time="1d"
        body="Rain or not, Saturday I run it."
      />
      <HypePost kind="system" time="SUN" body="THE CHALLENGE IS SET." />
    </View>
  ),
};

/** Every kind on each ground it appears on (forming, confirmed, live). */
export const OnEachSituation: Story = {
  parameters: { ojoro: { padded: false } },
  render: () => (
    <EachSituation only={['forming', 'confirmed', 'live']}>
      <HypePost kind="system" time="8:31" body="BOTH ARE HERE." />
      <HypePost
        kind="competitor"
        author="Chimdi O"
        side="CHIMDI"
        time="1d"
        body="Rain or not, Saturday I run it."
      />
      <HypePost
        kind="evidence"
        author="Marcus T"
        time="3h"
        body="Last tempo run before Saturday."
        stats={[{ value: '5.2 KM', label: 'distance' }]}
      />
      <HypePost kind="supporter" author="Ade B" time="20m" body="Go on then." />
    </EachSituation>
  ),
};
