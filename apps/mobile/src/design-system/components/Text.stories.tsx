import { textStyles, type TextStyleName } from '@ojoro/design-tokens';
import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { Section } from '../stories/storyKit';
import { Text } from './Text';

const variants = Object.keys(textStyles) as TextStyleName[];
const uiVariants = variants.filter((v) => textStyles[v].family === 'ui');
const displayVariants = variants.filter((v) => textStyles[v].family === 'display');

const meta = {
  title: 'Foundations/Text',
  component: Text,
  args: {
    variant: 'body',
    muted: false,
    children: '11 people near you want to play.',
  },
  argTypes: {
    variant: { control: { type: 'select' }, options: variants },
    muted: { control: { type: 'boolean' } },
    children: { control: { type: 'text' } },
  },
} satisfies Meta<typeof Text>;

export default meta;

type Story = StoryObj<typeof meta>;

/** One Text, driven by the controls. */
export const Playground: Story = {};

/** Every variant. Display styles are uppercased by the component, whatever the input case. */
export const Variants: Story = {
  render: () => (
    <View>
      <Section title="Display (Anton, always uppercase)">
        {displayVariants.map((v) => (
          <Text key={v} variant={v}>
            {v.replace('display-', '')} game on
          </Text>
        ))}
      </Section>
      <Section title="UI (Inter, sentence case)">
        {uiVariants.map((v) => (
          <Text key={v} variant={v}>
            {v}: pickup football at 7:30
          </Text>
        ))}
      </Section>
    </View>
  ),
};

/** `muted` swaps text for text-muted. overline is muted by default. */
export const Muted: Story = {
  render: () => (
    <Section title="Default · muted">
      {uiVariants.map((v) => (
        <View key={v} className="flex-row gap-space-4">
          <Text variant={v} style={{ flex: 1 }}>
            {v}
          </Text>
          <Text variant={v} muted style={{ flex: 1 }}>
            {v} muted
          </Text>
        </View>
      ))}
    </Section>
  ),
};

/** A long display headline on a 390pt screen with space-5 gutters: wraps, never truncates. */
export const LongDisplayHeadline: Story = {
  parameters: { ojoro: { padded: false } },
  render: () => (
    <View className="border-x border-line p-space-5" style={{ width: 390 }}>
      <Text variant="overline">390pt frame</Text>
      <Text variant="display-xl">Pickup football at Jeanne-Mance tonight</Text>
      <Text variant="display-md">Need one more for five a side</Text>
      <Text variant="body">The headline wraps onto as many lines as it needs.</Text>
    </View>
  ),
};
