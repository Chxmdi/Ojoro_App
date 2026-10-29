import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { EachSituation, onSituation, Section } from '../stories/storyKit';
import { CHAT_GAP, ChatMessage, ChatNotice } from './ChatMessage';

const meta = {
  title: 'Social/ChatMessage',
  component: ChatMessage,
  args: {
    author: 'Lena',
    fullName: 'Lena R',
    time: '2:14 PM',
    body: "Thursday's going to be a washout. Anyone up for Saturday morning instead?",
    testID: 'message',
  },
  argTypes: {
    own: { control: { type: 'boolean' } },
    grouped: { control: { type: 'boolean' } },
    deleted: { control: { type: 'boolean' } },
    status: { control: { type: 'select' }, options: ['sent', 'sending', 'failed'] },
  },
} satisfies Meta<typeof ChatMessage>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Someone else's message: avatar, name, body. No bubble. */
export const Others: Story = {};

/** Yours: right, `surface-raised`, "You" over it. */
export const Own: Story = {
  args: { own: true, author: 'Femi', body: "Same. Let's actually lock it this time." },
};

/** CrewChat's conversation, 20pt apart, with the day line. */
export const CrewChatThread: Story = {
  render: () => (
    <View style={{ gap: CHAT_GAP }}>
      <ChatNotice>TODAY · 2:14 PM</ChatNotice>
      <ChatMessage
        author="Lena"
        fullName="Lena R"
        body="Thursday's going to be a washout. Anyone up for Saturday morning instead?"
      />
      <ChatMessage author="Ade" fullName="Ade B" body="In, if it's before 11." />
      <ChatMessage
        author="Sam"
        fullName="Sam K"
        body="Saturday works. Jeanne-Mance or the indoor place?"
      />
      <ChatMessage own author="Femi" body="Same. Let's actually lock it this time." />
    </View>
  ),
};

/** Consecutive messages from one person group under one name, 8pt apart. */
export const Grouped: Story = {
  render: () => (
    <View style={{ gap: CHAT_GAP }}>
      <ChatMessage author="Sam" body="Saturday works." />
      <ChatMessage author="Sam" grouped body="Jeanne-Mance or the indoor place?" />
      <ChatMessage author="Sam" grouped body="Indoor has showers." />
      <ChatMessage own author="Femi" body="Jeanne-Mance." />
      <ChatMessage own grouped author="Femi" body="Weather says dry by 9." />
    </View>
  ),
};

/** A reply quotes the message it answers, one line. */
export const Reply: Story = {
  render: () => (
    <View style={{ gap: CHAT_GAP }}>
      <ChatMessage
        author="Sam"
        body="10 works for me."
        replyTo={{ author: 'Ade', body: "In, if it's before 11." }}
      />
      <ChatMessage
        own
        author="Femi"
        body="Booking 10."
        replyTo={{
          author: 'Sam',
          body: 'Saturday works. Jeanne-Mance or the indoor place? Indoor has showers and a café.',
        }}
      />
    </View>
  ),
};

/** Deleted, theirs and yours. */
export const Deleted: Story = {
  render: () => (
    <View style={{ gap: CHAT_GAP }}>
      <ChatMessage author="Sam" body="x" deleted />
      <ChatMessage own author="Femi" body="x" deleted />
    </View>
  ),
};

/** Yours on its way, and failed: alert icon, "Not sent.", TRY AGAIN and a heavier rule. */
export const SendingAndFailed: Story = {
  render: function Render() {
    const [status, setStatus] = useState<'failed' | 'sending' | 'sent'>('failed');
    return (
      <View style={{ gap: CHAT_GAP }}>
        <ChatMessage own author="Femi" body="On my way." status="sending" />
        <ChatMessage
          own
          author="Femi"
          body="Bringing the bibs."
          status={status}
          onRetry={() => {
            setStatus('sending');
            setTimeout(() => setStatus('sent'), 1200);
          }}
        />
      </View>
    );
  },
};

/** Long-press (or the "More options" action) opens report and block. */
export const WithActions: Story = {
  render: function Render() {
    const [opened, setOpened] = useState(0);
    return (
      <View style={{ gap: CHAT_GAP }}>
        <ChatMessage author="Sam" body="Long-press me." onMore={() => setOpened((n) => n + 1)} />
        <ChatNotice>{`Actions opened ${opened} times`}</ChatNotice>
      </View>
    );
  },
};

/** Every state at once. */
export const States: Story = {
  render: () => (
    <View>
      <Section title="Others">
        <ChatMessage author="Lena" body="Anyone up for Saturday?" />
      </Section>
      <Section title="Own">
        <ChatMessage own author="Femi" body="Same." />
      </Section>
      <Section title="Sending">
        <ChatMessage own author="Femi" body="On my way." status="sending" />
      </Section>
      <Section title="Failed">
        <ChatMessage own author="Femi" body="On my way." status="failed" onRetry={() => {}} />
      </Section>
      <Section title="Deleted">
        <ChatMessage author="Sam" body="x" deleted />
      </Section>
    </View>
  ),
};

/** Calm and forming (CrewChat's grounds). */
export const OnEachSituation: Story = {
  parameters: { ojoro: { padded: false } },
  render: () => (
    <EachSituation only={['calm', 'forming']}>
      <View style={{ gap: CHAT_GAP }}>
        <ChatMessage author="Ade" body="In, if it's before 11." />
        <ChatMessage own author="Femi" body="Same." />
      </View>
    </EachSituation>
  ),
};

/** Live grounds hold chat too (Activity during a game). */
export const OnLive: Story = {
  parameters: onSituation('live'),
  render: () => (
    <View style={{ gap: CHAT_GAP }}>
      <ChatMessage author="Yara" body="Darks need one more." />
      <ChatMessage own author="Femi" body="Coming." status="failed" onRetry={() => {}} />
    </View>
  ),
};
