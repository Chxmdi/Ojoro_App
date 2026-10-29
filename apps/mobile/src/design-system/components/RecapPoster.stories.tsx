import type { Meta, StoryObj } from '@storybook/react-native';

import { EachSituation, onSituation } from '../stories/storyKit';
import { RecapPoster } from './RecapPoster';

const meta = {
  title: 'Competition/RecapPoster',
  component: RecapPoster,
  parameters: onSituation('after', { padded: false }),
  args: {
    winner: 'Chimdi',
    discipline: '5K',
    date: 'SAT 12 OCT',
    result: 'Chimdi by 43 s',
    stats: [
      { value: '22:48', label: 'Chimdi' },
      { value: '23:31', label: 'Marcus' },
      { value: '212', label: 'Watched' },
    ],
    story: 'Out hard, held it through the last climb on Camillien-Houde. 43 seconds.',
  },
} satisfies Meta<typeof RecapPoster>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Result: RECAP · SAT 12 OCT, VERIFIED, the crown, CHIMDI WINS., the numbers, the story. */
export const Default: Story = {};

/** A team result (LIGHTS WIN 5–4. is the activity Recap; here a crew name). */
export const Minimal: Story = {
  args: {
    winner: 'Lights',
    discipline: 'Football',
    date: undefined,
    stats: undefined,
    story: undefined,
  },
};

/** A long winner name wraps at the poster hero size. */
export const LongName: Story = { args: { winner: 'Jean-Baptiste' } };

/** Always after (stone), inside any page. */
export const InsideOtherSituations: Story = {
  parameters: { ojoro: { padded: false } },
  render: (args) => (
    <EachSituation only={['calm', 'live']}>
      <RecapPoster {...args} />
    </EachSituation>
  ),
};
