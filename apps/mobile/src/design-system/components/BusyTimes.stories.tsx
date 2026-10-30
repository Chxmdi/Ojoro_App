import type { Meta, StoryObj } from '@storybook/react-native';

import { EachSituation, onSituation } from '../stories/storyKit';
import { BusyTimes, type BusyTimesDatum } from './BusyTimes';
import { Divider } from './Divider';

/* Sample content from Place. Seed data, not product copy. */
const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const week = (values: number[]): BusyTimesDatum[] =>
  values.map((value, i) => ({
    label: names[i]!.slice(0, 3).toUpperCase(),
    name: names[i]!,
    value,
  }));

const meta = {
  title: 'Places/BusyTimes',
  component: BusyTimes,
  parameters: onSituation('calm'),
  args: {
    title: "When it's busy, evenings",
    data: week([30, 85, 70, 100, 45, 60, 40]),
    currentIndex: 1,
    period: 'evenings',
  },
} satisfies Meta<typeof BusyTimes>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Place: tonight in signal, its day in ink, and the sentence says it. */
export const Default: Story = {
  render: (args) => (
    <>
      <Divider label="WHEN IT'S BUSY · EVENINGS" />
      <BusyTimes {...args} />
    </>
  ),
};

/** Tonight is the busiest. */
export const TonightBusiest: Story = { args: { currentIndex: 3 } };

/** No current slot (another week). */
export const NoCurrent: Story = { args: { currentIndex: null } };

/** No games yet: flat bars and a plain sentence. */
export const NoData: Story = { args: { data: week([0, 0, 0, 0, 0, 0, 0]) } };

/** On every ground it can sit on. */
export const Situations: Story = {
  render: (args) => <EachSituation>{() => <BusyTimes {...args} />}</EachSituation>,
};
