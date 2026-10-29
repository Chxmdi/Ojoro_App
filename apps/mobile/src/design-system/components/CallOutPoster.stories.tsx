import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { EachSituation, onSituation } from '../stories/storyKit';
import { CALL_OUT_STATUSES, CallOutPoster } from './CallOutPoster';

const meta = {
  title: 'Competition/CallOutPoster',
  component: CallOutPoster,
  parameters: onSituation('live', { padded: false }),
  args: {
    challenger: { name: 'Marcus' },
    opponent: { name: 'Chimdi' },
    discipline: '5K',
    when: 'Sat 12 Oct · 9:00',
    status: 'PENDING',
  },
  argTypes: {
    status: { control: { type: 'select' }, options: [...CALL_OUT_STATUSES] },
    actions: { control: { type: 'boolean' } },
  },
} satisfies Meta<typeof CallOutPoster>;

export default meta;

type Story = StoryObj<typeof meta>;

/** CallOut: MARCUS VS CHIMDI, PENDING, 5K, the date. */
export const Pending: Story = {};

/** The recipient's three choices: ACCEPT (heavy haptic) · COUNTER · PASS. */
export const WithActions: Story = { args: { actions: true } };

/** ACCEPTED fills the badge; the word carries it. */
export const Accepted: Story = { args: { status: 'ACCEPTED' } };

/** COUNTERED. */
export const Countered: Story = { args: { status: 'COUNTERED' } };

/** DECLINED. */
export const Declined: Story = { args: { status: 'DECLINED' } };

/** No date: the foot is the discipline alone. Long names wrap, never truncate. */
export const LongNames: Story = {
  args: {
    challenger: { name: 'Oluwaseun' },
    opponent: { name: 'Jean-Baptiste' },
    discipline: '10K',
    when: undefined,
  },
};

/** Always live: black inside a calm page (Compete) or an after page. */
export const InsideOtherSituations: Story = {
  render: (args) => (
    <EachSituation only={['calm', 'forming', 'after']}>
      <View>
        <CallOutPoster {...args} />
      </View>
    </EachSituation>
  ),
};
