import type { Meta, StoryObj } from '@storybook/react-native';

import { EachSituation, onSituation } from '../stories/storyKit';
import { Rivalry } from './Rivalry';

const meta = {
  title: 'Competition/Rivalry',
  component: Rivalry,
  parameters: onSituation('live', { padded: false }),
  args: {
    a: { name: 'Chimdi' },
    b: { name: 'Marcus' },
    record: { a: 5, b: 3, draws: 1 },
    history: ['b', 'a', 'd', 'b', 'a', 'b', 'a', 'a'],
  },
} satisfies Meta<typeof Rivalry>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Rivalry: 9 MEETINGS, 5 / 3, the form line (C filled, M outlined, = on track). */
export const Default: Story = {};

/** Compete: with the next meeting. */
export const WithNext: Story = {
  args: {
    record: { a: 4, b: 3, draws: 1 },
    history: ['a', 'b', 'a', 'd', 'b', 'a', 'b', 'a'],
    next: '5K · Sat 12 Oct',
  },
};

/** Level, no draws. */
export const Level: Story = {
  args: { record: { a: 2, b: 2 }, history: ['a', 'b', 'b', 'a'] },
};

/** Empty: they haven't met. No form line; the next meeting is the first. */
export const FirstMeeting: Story = {
  args: { record: { a: 0, b: 0 }, history: [], next: '5K · Sat 12 Oct' },
};

/** Double-digit records and long names still fit the poster hero. */
export const LongRecord: Story = {
  args: {
    a: { name: 'Oluwaseun' },
    b: { name: 'Jean-Baptiste' },
    record: { a: 12, b: 10, draws: 3 },
  },
};

/** Always live, inside a calm Compete page or the after Rivalry page. */
export const InsideOtherSituations: Story = {
  parameters: { ojoro: { padded: false } },
  render: (args) => (
    <EachSituation only={['calm', 'after']}>
      <Rivalry {...args} />
    </EachSituation>
  ),
};
