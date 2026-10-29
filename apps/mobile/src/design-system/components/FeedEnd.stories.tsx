import type { Meta, StoryObj } from '@storybook/react-native';

import { EachSituation, onSituation } from '../stories/storyKit';
import { Button } from './Button';
import { FeedEnd } from './FeedEnd';

const meta = {
  title: 'Primitives/FeedEnd',
  component: FeedEnd,
  args: { title: "YOU'RE CAUGHT UP.", message: 'Go do something.', size: 'md' },
  parameters: onSituation('calm'),
} satisfies Meta<typeof FeedEnd>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Main. */
export const Default: Story = { args: { testID: 'end' } };

/** FirstHome: the small size. */
export const Small: Story = {
  args: {
    title: "THAT'S EVERYTHING.",
    message: "Start something and it'll be here tomorrow.",
    size: 'sm',
    testID: 'end',
  },
};

/** With an action under the message. */
export const WithAction: Story = {
  render: (args) => (
    <FeedEnd {...args}>
      <Button variant="secondary" onPress={() => {}}>
        START SOMETHING
      </Button>
    </FeedEnd>
  ),
};

export const Situations: Story = {
  parameters: { ojoro: { padded: false } },
  render: (args) => (
    <EachSituation only={['calm', 'forming', 'after']}>
      <FeedEnd {...args} />
    </EachSituation>
  ),
};
