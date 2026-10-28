import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { EachSituation, Section } from '../stories/storyKit';
import { Divider, type DividerKind } from './Divider';
import { Text } from './Text';

const kinds: DividerKind[] = ['hair', 'strong', 'mark'];

const meta = {
  title: 'Primitives/Divider',
  component: Divider,
  args: { kind: 'hair' },
  argTypes: {
    kind: { control: { type: 'select' }, options: kinds },
    label: { control: { type: 'text' } },
  },
} satisfies Meta<typeof Divider>;

export default meta;

type Story = StoryObj<typeof meta>;

/** One divider, driven by the controls. */
export const Playground: Story = {};

/** The three rules: hairline between strips, strong between sections, the Mark for competition. */
export const Kinds: Story = {
  render: () => (
    <View>
      {kinds.map((kind) => (
        <Section key={kind} title={kind}>
          <Divider kind={kind} />
        </Section>
      ))}
    </View>
  ),
};

/** An overline set into the rule. */
export const Labelled: Story = {
  render: () => (
    <View className="gap-space-8">
      <Divider label="THIS WEEK" />
      <Divider kind="strong" label="WHO'S PLAYING · 8 OF 8" />
      <Divider kind="mark" label="CREW VS CREW" />
    </View>
  ),
};

/** Between content: a hairline separates two strips. */
export const BetweenStrips: Story = {
  render: () => (
    <View>
      <Text variant="title" className="py-space-3">
        Pickup basketball
      </Text>
      <Divider />
      <Text variant="title" className="py-space-3">
        5K run club
      </Text>
    </View>
  ),
};

/** Every kind, plain and labelled, on every ground. */
export const OnEachSituation: Story = {
  parameters: { ojoro: { padded: false } },
  render: () => (
    <EachSituation>
      <View className="gap-space-5">
        <Divider />
        <Divider kind="strong" />
        <Divider kind="mark" />
        <Divider label="TONIGHT" />
        <Divider kind="mark" label="VS" />
      </View>
    </EachSituation>
  ),
};
