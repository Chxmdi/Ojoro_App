import type { Meta, StoryObj } from '@storybook/react-native';

import { View } from 'react-native';

import { EachSituation, onSituation } from '../stories/storyKit';
import { Quote, QUOTE_VARIANTS } from './Quote';
import { Text } from './Text';

const meta = {
  title: 'Primitives/Quote',
  component: Quote,
  args: {
    children: 'Played Sunday league for years. Happy in goal if you need one.',
    variant: 'note',
    testID: 'quote',
  },
  argTypes: { variant: { control: { type: 'select' }, options: [...QUOTE_VARIANTS] } },
} satisfies Meta<typeof Quote>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The request note (`.req-note`), on calm. */
export const Note: Story = {};

/** HostRequests: the note inside a join request (raised ground, 20pt padding). */
export const InRequest: Story = {
  render: (args) => (
    <View className="gap-space-4 bg-surface-raised p-space-5">
      <Quote {...args} />
      <Text variant="body-sm" muted>
        12 games on Ojoro · usually plays Tuesdays
      </Text>
    </View>
  ),
  args: {
    children:
      "Haven't played football since school. Want to get back into it with people who won't mind.",
  },
};

/** CallOut: the challenger's message with its attribution, on live. */
export const Callout: Story = {
  args: {
    variant: 'callout',
    children: 'Saturday. Mount Royal. Bring your legs.',
    attribution: 'Marcus T · 12 games together · rivalry 3–4',
  },
  parameters: onSituation('live'),
};

export const Situations: Story = {
  parameters: { ojoro: { padded: false } },
  render: () => (
    <EachSituation only={['calm', 'live']}>
      <Quote>Played Sunday league for years. Happy in goal if you need one.</Quote>
      <Quote variant="callout" attribution="Marcus T · 12 games together · rivalry 3–4">
        Saturday. Mount Royal. Bring your legs.
      </Quote>
    </EachSituation>
  ),
};
