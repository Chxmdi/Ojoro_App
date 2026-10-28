import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { EachSituation, onSituation, Section } from '../stories/storyKit';
import { Text } from './Text';
import { TextButton } from './TextButton';

const meta = {
  title: 'Primitives/TextButton',
  component: TextButton,
  args: { children: 'UNDO', on: false, disabled: false },
  argTypes: {
    children: { control: { type: 'text' } },
    on: { control: { type: 'boolean' } },
    disabled: { control: { type: 'boolean' } },
  },
} satisfies Meta<typeof TextButton>;

export default meta;

type Story = StoryObj<typeof meta>;

/** One text button, driven by the controls. */
export const Playground: Story = {};

/** Same items, order and spacing as the reference, for side-by-side checks. */
export const Reference: Story = {
  render: () => (
    <View className="gap-space-4">
      <TextButton>UNDO</TextButton>
      <TextButton>SKIP</TextButton>
      <TextButton accessibilityLabel="Edit price for Drop-in">EDIT</TextButton>
      <TextButton on>ON</TextButton>
      <TextButton disabled>UNDO</TextButton>
    </View>
  ),
};

/** States on every ground: default (text-muted), on (text, underlined), disabled. */
export const States: Story = {
  parameters: { ojoro: { padded: false } },
  render: () => (
    <EachSituation>
      <View className="flex-row flex-wrap items-center gap-space-4">
        <TextButton>UNDO</TextButton>
        <TextButton>SKIP</TextButton>
        <TextButton on>ON</TextButton>
        <TextButton disabled>EDIT</TextButton>
      </View>
    </EachSituation>
  ),
};

/** In a row, trailing a line (HostRequests): the word looks small, the touch area is 44pt tall. */
export const InARow: Story = {
  parameters: onSituation('forming'),
  render: () => {
    function Row() {
      const [declined, setDeclined] = useState(true);
      return (
        <View className="min-h-touch flex-row items-center justify-between border-b border-line">
          <Text variant="body">{declined ? 'Declined Maya' : 'Maya is waiting'}</Text>
          {declined ? <TextButton onPress={() => setDeclined(false)}>UNDO</TextButton> : null}
        </View>
      );
    }
    function Toggle() {
      const [on, setOn] = useState(false);
      return (
        <View className="min-h-touch flex-row items-center justify-between border-b border-line">
          <Text variant="body">Reminder the day before</Text>
          <TextButton
            on={on}
            accessibilityLabel={on ? 'Turn off the reminder' : 'Turn on the reminder'}
            onPress={() => setOn((v) => !v)}
          >
            {on ? 'ON' : 'OFF'}
          </TextButton>
        </View>
      );
    }
    return (
      <Section title="Press UNDO, press the toggle">
        <Row />
        <Toggle />
      </Section>
    );
  },
};
