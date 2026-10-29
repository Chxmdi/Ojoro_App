import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { Section } from '../stories/storyKit';
import { NotificationGroup, NotificationRow, NOTIFICATION_TONES } from './NotificationRow';
import { Text } from './Text';

const meta = {
  title: 'Social/NotificationRow',
  component: NotificationRow,
  args: {
    title: 'Marcus called you out.',
    body: '5K · Mount Royal loop · Sat 9:00',
    time: '2 h ago',
    graphic: 'mark',
    tone: 'strong',
    action: 'REPLY',
    onAction: () => {},
    testID: 'notification',
  },
  argTypes: {
    tone: { control: { type: 'select' }, options: [...NOTIFICATION_TONES] },
    unread: { control: { type: 'boolean' } },
    actionVariant: { control: { type: 'select' }, options: ['primary', 'secondary'] },
  },
} satisfies Meta<typeof NotificationRow>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Needs you: strong ring, one secondary action. */
export const NeedsYou: Story = {};

/** The one commitment: I'M DOWN in primary. */
export const Commitment: Story = {
  args: {
    title: 'Basketball needs one more.',
    body: 'Sat 10:00 · Parc La Fontaine · 7 / 8. You have Pull Me In on for basketball.',
    time: '4 min ago',
    graphic: undefined,
    icon: 'people',
    action: "I'M DOWN",
    actionVariant: 'primary',
  },
};

/** A threshold reached: filled signal disc, the row opens GAME ON. */
export const GameOn: Story = {
  args: {
    title: 'GAME ON · football tonight',
    body: 'All 8 are in. 7:30, Jeanne-Mance.',
    time: '5:12 PM',
    graphic: undefined,
    icon: 'check',
    tone: 'signal',
    action: undefined,
    onPress: () => {},
  },
};

/** A person: their avatar instead of a disc. */
export const Person: Story = {
  args: {
    title: 'Lena joined Thursday FC',
    body: 'Invited by Ade after her first game',
    time: 'Sun',
    graphic: undefined,
    person: { name: 'Lena R' },
    tone: 'quiet',
    action: undefined,
  },
};

/** Unread: NEW in words before the time. */
export const Unread: Story = {
  args: {
    title: '3 new posts in Chimdi vs Marcus',
    body: 'Marcus, Ade and an Ojoro update · bundled',
    time: '1:05 PM',
    graphic: undefined,
    icon: 'bell',
    tone: 'quiet',
    unread: true,
    action: undefined,
    onPress: () => {},
  },
};

/** The Notifications screen's list, grouped. */
export const Updates: Story = {
  render: () => (
    <View className="gap-space-8">
      <NotificationGroup title="Needs you" count={3} strong>
        <NotificationRow
          icon="people"
          tone="strong"
          title="Basketball needs one more."
          body="Sat 10:00 · Parc La Fontaine · 7 / 8. You have Pull Me In on for basketball."
          time="4 min ago"
          action="I'M DOWN"
          actionVariant="primary"
          onAction={() => {}}
        />
        <NotificationRow
          graphic="mark"
          tone="strong"
          title="Marcus called you out."
          body="5K · Mount Royal loop · Sat 9:00"
          time="2 h ago"
          action="REPLY"
          onAction={() => {}}
        />
        <NotificationRow
          icon="chat"
          tone="strong"
          title="Thursday FC: what time Saturday?"
          body="Lena started a poll · 9 votes so far"
          time="2:20 PM"
          action="VOTE"
          onAction={() => {}}
        />
      </NotificationGroup>
      <NotificationGroup title="Today">
        <NotificationRow
          icon="check"
          tone="signal"
          title="GAME ON · football tonight"
          body="All 8 are in. 7:30, Jeanne-Mance."
          time="5:12 PM"
          onPress={() => {}}
        />
        <NotificationRow
          icon="bell"
          title="3 new posts in Chimdi vs Marcus"
          body="Marcus, Ade and an Ojoro update · bundled"
          time="1:05 PM"
          onPress={() => {}}
        />
        <NotificationRow
          icon="clock"
          title="Check-in opens at 7:00"
          body="Football · Jeanne-Mance"
          time="Reminder set"
        />
      </NotificationGroup>
      <NotificationGroup title="Earlier">
        <NotificationRow
          graphic="o"
          title="Recap ready: Lights win 5–4"
          body="Add photos until Wed 9 PM"
          time="Yesterday"
          onPress={() => {}}
        />
        <NotificationRow
          person={{ name: 'Lena R' }}
          title="Lena joined Thursday FC"
          body="Invited by Ade after her first game"
          time="Sun"
        />
      </NotificationGroup>
    </View>
  ),
};

/** Each disc tone. */
export const Tones: Story = {
  render: () => (
    <View>
      {NOTIFICATION_TONES.map((tone) => (
        <Section key={tone} title={tone}>
          <NotificationRow
            icon="bell"
            tone={tone}
            title="Check-in opens at 7:00"
            time="Reminder set"
          />
        </Section>
      ))}
      <Text variant="caption" muted>
        Quiet: Today and Earlier. Strong: Needs you. Signal: a threshold reached.
      </Text>
    </View>
  ),
};
