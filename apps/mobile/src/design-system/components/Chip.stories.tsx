import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { EachSituation, onSituation, Section } from '../stories/storyKit';
import { Chip } from './Chip';

const meta = {
  title: 'Primitives/Chip',
  component: Chip,
  args: { selected: false, disabled: false, children: 'Football' },
  argTypes: {
    selected: { control: { type: 'boolean' } },
    disabled: { control: { type: 'boolean' } },
    children: { control: { type: 'text' } },
  },
} satisfies Meta<typeof Chip>;

export default meta;

type Story = StoryObj<typeof meta>;

/** One chip, driven by the controls. */
export const Playground: Story = {};

/** Same items, order and spacing as the web reference harness, for side-by-side checks. */
export const Reference: Story = {
  render: () => (
    <View className="gap-space-4">
      <Chip>Football</Chip>
      <Chip selected>Basketball</Chip>
      <Chip>Tonight</Chip>
      <Chip selected>Thursday after 6</Chip>
    </View>
  ),
};

/** Default and selected on every ground. Selected adds the check, not only the fill. */
export const States: Story = {
  parameters: { ojoro: { padded: false } },
  render: () => (
    <EachSituation>
      <View className="flex-row flex-wrap gap-space-2">
        <Chip>Football</Chip>
        <Chip selected>Basketball</Chip>
        <Chip disabled>Tennis</Chip>
      </View>
    </EachSituation>
  ),
};

const sports = [
  'Football',
  'Basketball',
  'Running',
  'Tennis',
  'Volleyball',
  'Climbing',
  'Ultimate frisbee',
];

/** A row that runs out of room scrolls sideways; chips never shrink or wrap their label. Press to select. */
export const ScrollingRow: Story = {
  parameters: onSituation('forming', { padded: false }),
  render: () => {
    function Picker() {
      const [picked, setPicked] = useState<string[]>(['Basketball']);
      const toggle = (s: string) =>
        setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
      return (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-space-2 p-space-5"
        >
          {sports.map((s) => (
            <Chip key={s} selected={picked.includes(s)} onPress={() => toggle(s)}>
              {s}
            </Chip>
          ))}
        </ScrollView>
      );
    }
    return <Picker />;
  },
};

/** Long labels stay on one line; in a wrapping layout the chip takes its full width. */
export const LongLabels: Story = {
  render: () => (
    <Section title="Long labels">
      <View className="flex-row flex-wrap gap-space-2">
        <Chip>Weekday mornings before work</Chip>
        <Chip selected>Saturday afternoon</Chip>
        <Chip>Mile End Runners</Chip>
      </View>
    </Section>
  ),
};

/** Keyboard focus: tab to a chip (web) or use a hardware keyboard to see the 2px focus ring. */
export const Focus: Story = {
  parameters: onSituation('live'),
  render: () => (
    <View className="flex-row flex-wrap gap-space-3">
      <Chip>Football</Chip>
      <Chip selected>Basketball</Chip>
    </View>
  ),
};
