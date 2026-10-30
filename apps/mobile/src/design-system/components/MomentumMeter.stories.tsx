import type { Meta, StoryObj } from '@storybook/react-native';

import { EachSituation, onSituation } from '../stories/storyKit';
import { MomentumMeter } from './MomentumMeter';

const meta = {
  title: 'Communities/MomentumMeter',
  component: MomentumMeter,
  parameters: onSituation('calm'),
  args: { weeks: [2, 3, 1, 4, 5, 3, 5, 7], streak: 6, label: 'RHYTHM · 8 WEEKS' },
  argTypes: { streak: { control: { type: 'number' } } },
} satisfies Meta<typeof MomentumMeter>;

export default meta;

type Story = StoryObj<typeof meta>;

/** CrewHome: eight weeks, this week in signal, the streak in words. */
export const Default: Story = {};

/** No label: the overline reads MOMENTUM. */
export const DefaultLabel: Story = { args: { label: undefined } };

/** No streak: nothing is written (never "0 WEEK STREAK"); a quiet week shows a 6pt stub so it can still be counted. */
export const NoStreak: Story = { args: { weeks: [3, 2, 0, 0, 1, 0, 0, 0], streak: 0 } };

/** A missed week is a comeback, in words, never a loss (PRD §9.12). */
export const Comeback: Story = { args: { weeks: [3, 2, 3, 4, 0, 2, 0, 1], streak: 0, streakText: 'COMEBACK WEEK', label: 'RHYTHM · 8 WEEKS' } };

/** A new crew's first weeks. */
export const FirstWeek: Story = { args: { weeks: [0, 0, 0, 0, 0, 0, 0, 1], streak: 0, streakText: 'FIRST WEEK', label: 'RHYTHM · 8 WEEKS' } };

/** A new crew: no history yet. */
export const Empty: Story = { args: { weeks: [], streak: 0 } };

/** Every week the same: all bars full height. */
export const Flat: Story = { args: { weeks: [4, 4, 4, 4, 4, 4, 4, 4], streak: 8 } };

/** On each ground. */
export const OnEachSituation: Story = {
  parameters: { ojoro: { padded: false } },
  render: (args) => (
    <EachSituation>
      <MomentumMeter {...args} />
    </EachSituation>
  ),
};
