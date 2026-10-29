import type { Meta, StoryObj } from '@storybook/react-native';

import { EachSituation, onSituation } from '../stories/storyKit';
import { Rematch } from './Rematch';

const meta = {
  title: 'Competition/Rematch',
  component: Rematch,
  parameters: onSituation('after', { padded: false }),
  args: {
    requester: 'Marcus',
    opponent: 'Chimdi',
    discipline: 'the 5K',
    lastResult: 'Chimdi by 43s',
    note: 'Same loop, two weeks. Best of three?',
  },
} satisfies Meta<typeof Rematch>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Rivalry page: LAST TIME · CHIMDI BY 43S, REMATCH? with the Mark, RUN IT BACK · NOT YET. */
export const Default: Story = {};

/** No note. */
export const NoNote: Story = { args: { note: undefined } };

/** Always after, under a live Rivalry (as on the Rivalry page) or anywhere else. */
export const InsideOtherSituations: Story = {
  parameters: { ojoro: { padded: false } },
  render: (args) => (
    <EachSituation only={['live', 'calm']}>
      <Rematch {...args} />
    </EachSituation>
  ),
};
