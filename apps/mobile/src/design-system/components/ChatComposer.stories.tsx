import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { onSituation, Section } from '../stories/storyKit';
import { ChatComposer } from './ChatComposer';
import { Text } from './Text';

const meta = {
  title: 'Social/ChatComposer',
  component: ChatComposer,
  parameters: onSituation('calm', { padded: false }),
  args: {
    value: '',
    onChangeText: () => {},
    onSend: () => {},
    placeholder: 'Message Thursday FC',
    testID: 'composer',
  },
  argTypes: {
    offline: { control: { type: 'boolean' } },
    disabled: { control: { type: 'boolean' } },
    sending: { control: { type: 'boolean' } },
  },
} satisfies Meta<typeof ChatComposer>;

export default meta;

type Story = StoryObj<typeof meta>;

/** CrewChat's footer, empty: send waits. */
export const Empty: Story = {};

/** Something typed: send is ready. */
export const Typed: Story = { args: { value: 'Jeanne-Mance, 10?' } };

/** Offline: keep typing; send waits and the hint says why. */
export const Offline: Story = { args: { value: 'Jeanne-Mance, 10?', offline: true } };

/** Can't post here: greyed, with the reason. */
export const Disabled: Story = {
  args: { disabled: true, disabledReason: 'You left Thursday FC. Rejoin to post.' },
};

/** A send in flight: the button waits so it can't double-send. */
export const Sending: Story = { args: { value: 'Jeanne-Mance, 10?', sending: true } };

/** The send failed. */
export const SendError: Story = {
  args: {
    value: 'Jeanne-Mance, 10?',
    error: "Couldn't send. Check your connection and try again.",
  },
};

/** Type, send, clear. Multi-line grows up to five lines. */
export const Interactive: Story = {
  render: function Render() {
    const [value, setValue] = useState('');
    const [sent, setSent] = useState<string[]>([]);
    return (
      <View>
        <Section title={`Sent: ${sent.length}`}>
          <Text variant="caption" muted>
            {sent.at(-1) ?? 'Nothing sent yet.'}
          </Text>
        </Section>
        <ChatComposer
          value={value}
          onChangeText={setValue}
          onSend={(text) => {
            setSent((s) => [...s, text]);
            setValue('');
          }}
          placeholder="Message Thursday FC"
        />
      </View>
    );
  },
};

/** On forming and live grounds. */
export const OnLive: Story = {
  parameters: onSituation('live', { padded: false }),
  args: { value: 'Coming.' },
};
