import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { CHAT_GAP, ChatMessage, ChatNotice } from './ChatMessage';
import { GameSuggestion } from './GameSuggestion';
import { Poll } from './Poll';
import { Text } from './Text';

const meta = {
  title: 'Movement/GameSuggestion',
  component: GameSuggestion,
  args: {
    title: 'FOOTBALL, SATURDAY MORNING?',
    body: "4 of you want in. Ojoro can set up the plan with this crew already invited and ask only what's missing: time and place.",
    testID: 'suggestion',
  },
  argTypes: {
    accepting: { control: { type: 'boolean' } },
    offline: { control: { type: 'boolean' } },
    error: { control: { type: 'text' } },
  },
} satisfies Meta<typeof GameSuggestion>;

export default meta;

type Story = StoryObj<typeof meta>;

/** CrewChat: the suggestion on its forming ground inside the calm chat. */
export const Default: Story = {};

/** Setting the plan up. */
export const Accepting: Story = { args: { accepting: true } };

/** Offline: both buttons wait; the note says so. */
export const Offline: Story = { args: { offline: true } };

/** Couldn't set it up. */
export const SetupError: Story = { args: { error: "Couldn't set up the plan. Try again." } };

/** The flow: suggestion → MAKE THIS A GAME → the notice and the time poll. NOT NOW hides it. */
export const Flow: Story = {
  render: function Render() {
    const [state, setState] = useState<'open' | 'accepted' | 'dismissed'>('open');
    const [voted, setVoted] = useState<number | undefined>(undefined);
    return (
      <View style={{ gap: CHAT_GAP }}>
        <ChatMessage own author="Femi" body="Same. Let's actually lock it this time." />
        {state === 'open' ? (
          <GameSuggestion
            title="FOOTBALL, SATURDAY MORNING?"
            body="4 of you want in. Ojoro can set up the plan with this crew already invited and ask only what's missing: time and place."
            onAccept={() => setState('accepted')}
            onDismiss={() => setState('dismissed')}
          />
        ) : null}
        {state === 'accepted' ? (
          <>
            <ChatNotice>2:20 PM · Lena tapped MAKE THIS A GAME</ChatNotice>
            <View className="gap-space-2">
              <Text variant="caption" muted>
                9 of 14 are free Saturday between 9 and 11.
              </Text>
              <Poll
                question="WHAT TIME SATURDAY?"
                closes="tonight 9 PM"
                voted={voted}
                onVote={setVoted}
                options={[
                  { label: '9:00', votes: 4 + (voted === 0 ? 1 : 0) },
                  { label: '10:00', votes: 3 + (voted === 1 ? 1 : 0) },
                  { label: '10:30', votes: 1 + (voted === 2 ? 1 : 0) },
                ]}
              />
            </View>
          </>
        ) : null}
        {state === 'dismissed' ? <ChatNotice>Suggestion hidden for you.</ChatNotice> : null}
      </View>
    );
  },
};
