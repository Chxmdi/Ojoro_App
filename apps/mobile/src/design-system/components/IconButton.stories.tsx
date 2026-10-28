import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { EachSituation, onSituation, Section } from '../stories/storyKit';
import { ICONS, type IconName } from './Icon';
import { IconButton, type IconButtonVariant } from './IconButton';
import { Text } from './Text';

const variants: IconButtonVariant[] = ['plain', 'outline', 'solid'];

const meta = {
  title: 'Primitives/IconButton',
  component: IconButton,
  args: { icon: 'bell', label: 'Updates', variant: 'plain', count: 0, disabled: false },
  argTypes: {
    icon: { control: { type: 'select' }, options: Object.keys(ICONS) as IconName[] },
    label: { control: { type: 'text' } },
    variant: { control: { type: 'select' }, options: variants },
    count: { control: { type: 'number' } },
    disabled: { control: { type: 'boolean' } },
  },
} satisfies Meta<typeof IconButton>;

export default meta;

type Story = StoryObj<typeof meta>;

/** One icon button, driven by the controls. */
export const Playground: Story = {};

/** Same items, order and spacing as the web reference harness, for side-by-side checks. */
export const Reference: Story = {
  render: () => (
    <View className="gap-space-4">
      <IconButton icon="bell" label="Updates" />
      <IconButton icon="share" label="Share event" variant="outline" />
      <IconButton icon="forward" label="Send" variant="solid" />
      <IconButton icon="chat" label="Activity chat, 3 new" count={3} />
      <IconButton icon="bell" label="Updates, 12 new" count={12} variant="outline" />
      <IconButton icon="more" label="Report or block" disabled />
    </View>
  ),
};

function Row() {
  return (
    <View className="flex-row flex-wrap items-center gap-space-3">
      <IconButton icon="back" label="Back" />
      <IconButton icon="share" label="Share event" variant="outline" />
      <IconButton icon="plus" label="Start a plan" variant="solid" />
      <IconButton icon="chat" label="Activity chat, 3 new" count={3} />
      <IconButton icon="bell" label="Updates, 12 new" count={12} variant="outline" />
      <IconButton icon="more" label="Report or block" disabled />
    </View>
  );
}

/** Every variant, the count badge and disabled, on every ground. The badge keeps its white mark-ring on oxblood and black. */
export const Variants: Story = {
  parameters: { ojoro: { padded: false } },
  render: () => <EachSituation>{() => <Row />}</EachSituation>,
};

/** Count: 1–9 as the number, then 9+. The count is in the label, the badge is hidden from screen readers. */
export const Counts: Story = {
  parameters: onSituation('live'),
  render: () => (
    <View className="flex-row flex-wrap gap-space-3">
      {[1, 3, 9, 10, 240].map((n) => (
        <IconButton key={n} icon="chat" label={`Activity chat, ${n} new`} count={n} />
      ))}
    </View>
  ),
};

/** A header: back on the left, actions on the right, the one create action solid. */
export const InAHeader: Story = {
  render: () => {
    function Header() {
      const [seen, setSeen] = useState(false);
      return (
        <View className="flex-row items-center justify-between">
          <IconButton icon="back" label="Back" />
          <Text variant="title">Crew</Text>
          <View className="flex-row gap-space-1">
            <IconButton
              icon="bell"
              label={seen ? 'Updates' : 'Updates, 2 new'}
              count={seen ? 0 : 2}
              onPress={() => setSeen(true)}
            />
            <IconButton icon="plus" label="Start a plan" variant="solid" />
          </View>
        </View>
      );
    }
    return (
      <Section title="Press the bell to clear the count">
        <Header />
      </Section>
    );
  },
};

/** Keyboard focus: tab to a button (web) or use a hardware keyboard to see the 2px focus ring. */
export const Focus: Story = {
  parameters: onSituation('confirmed'),
  render: () => <Row />,
};
