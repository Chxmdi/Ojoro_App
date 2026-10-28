import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { EachSituation, Section } from '../stories/storyKit';
import { Input } from './Input';

const meta = {
  title: 'Primitives/Input',
  component: Input,
  args: { label: 'Name', placeholder: 'Tuesday 7-a-side' },
  argTypes: {
    label: { control: { type: 'text' } },
    hint: { control: { type: 'text' } },
    error: { control: { type: 'text' } },
    placeholder: { control: { type: 'text' } },
    multiline: { control: { type: 'boolean' } },
    disabled: { control: { type: 'boolean' } },
    icon: { control: { type: 'select' }, options: [undefined, 'pin', 'clock', 'search'] },
  },
} satisfies Meta<typeof Input>;

export default meta;

type Story = StoryObj<typeof meta>;

/** One Input, driven by the controls. */
export const Playground: Story = {};

/** Empty: the label is always visible; the placeholder is only an example. */
export const Empty: Story = { args: { label: 'Name', placeholder: 'Tuesday 7-a-side' } };

export const Filled: Story = { args: { label: 'Name', defaultValue: 'Tuesday 7-a-side' } };

export const Hint: Story = {
  args: {
    label: 'Opens for joining',
    defaultValue: '5 days before',
    hint: 'Members get it 48 hours earlier.',
  },
};

/** Error: a 4px `text` rule, the alert icon and "Error:" in words. Never red. */
export const Error: Story = {
  args: {
    label: 'Starts',
    icon: 'clock',
    defaultValue: '7:30 AM',
    hint: 'Pick a time after now.',
    error: 'That time has passed. Pick a time after now.',
  },
};

export const Disabled: Story = {
  args: { label: 'Drop-in', defaultValue: '$8', disabled: true, hint: 'Set by the venue.' },
};

/** Focused: the rule turns `signal` and the 2px focus ring shows. */
export const Focused: Story = {
  args: { label: 'Name', defaultValue: 'Tuesday 7-a-side', autoFocus: true },
};

export const Multiline: Story = {
  args: {
    label: 'Note to the group',
    multiline: true,
    defaultValue: 'Bring a dark and a light top. We split teams at check-in.',
  },
};

export const WithIcon: Story = {
  args: {
    label: 'Place',
    icon: 'pin',
    defaultValue: 'Jeanne-Mance Park · turf 2',
    hint: "People see the exact pitch once they're in.",
  },
};

/** Every state stacked, in the order the web harness renders them. */
export const States: Story = {
  render: () => (
    <View className="gap-space-4">
      <Input label="Name" placeholder="Tuesday 7-a-side" />
      <Input label="Name" defaultValue="Tuesday 7-a-side" />
      <Input
        label="Place"
        icon="pin"
        defaultValue="Jeanne-Mance Park · turf 2"
        hint="People see the exact pitch once they're in."
      />
      <Input
        label="Starts"
        icon="clock"
        defaultValue="7:30 AM"
        error="That time has passed. Pick a time after now."
      />
      <Input label="Drop-in" defaultValue="$8" disabled hint="Set by the venue." />
      <Input
        label="Note to the group"
        multiline
        defaultValue="Bring a dark and a light top. We split teams at check-in."
      />
    </View>
  ),
};

function Validating() {
  const [value, setValue] = useState('');
  return (
    <Input
      label="Crew name"
      value={value}
      onChangeText={setValue}
      hint="3 to 24 characters."
      {...(value.length > 0 && value.length < 3 ? { error: 'Use at least 3 characters.' } : null)}
    />
  );
}

/** Type fewer than 3 characters to see the error replace the hint. */
export const Interactive: Story = { render: () => <Validating /> };

/** Forms sit on calm and forming grounds; checked on all five. */
export const OnEachSituation: Story = {
  render: () => (
    <EachSituation>
      <Section title="Filled, hint, error">
        <Input label="Name" defaultValue="Tuesday 7-a-side" />
        <Input
          label="Place"
          icon="pin"
          defaultValue="Jeanne-Mance Park"
          hint="Areas, not addresses."
        />
        <Input label="Starts" icon="clock" defaultValue="7:30 AM" error="That time has passed." />
      </Section>
    </EachSituation>
  ),
};
