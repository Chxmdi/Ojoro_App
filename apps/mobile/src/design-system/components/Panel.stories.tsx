import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { EachSituation, onSituation } from '../stories/storyKit';
import { Button } from './Button';
import { Panel } from './Panel';
import { Progress } from './Progress';
import { Text } from './Text';

const meta = {
  title: 'Primitives/Panel',
  component: Panel,
  args: {
    overline: 'BRING YOUR PEOPLE',
    title: 'Ojoro works best with the friends you already move with.',
  },
  parameters: onSituation('calm'),
} satisfies Meta<typeof Panel>;

export default meta;

type Story = StoryObj<typeof meta>;

// Actions and content are passed in `render`, not `args`: Storybook walks
// args to infer controls and can't walk React elements.

/** FirstHome › Bring your people. */
export const Default: Story = {
  args: { accessibilityLabel: 'Bring your people', testID: 'panel' },
  render: (args) => (
    <Panel
      {...args}
      actions={
        <>
          <Button variant="primary" onPress={() => {}}>
            START A CREW
          </Button>
          <Button variant="secondary" onPress={() => {}}>
            INVITE FRIENDS
          </Button>
        </>
      }
    />
  ),
};

/** Create › BEST MATCH: muted body, a Progress, end-aligned actions. */
export const BestMatch: Story = {
  args: {
    overline: 'BEST MATCH',
    title: 'Pickup football · 7:30 · Jeanne-Mance',
    body: "Why: it fits your 90 minutes, it's 1.2 km away, and 3 people you've played with are in.",
    bodyMuted: true,
    actionsAlign: 'end',
    testID: 'panel',
  },
  render: (args) => (
    <Panel
      {...args}
      actions={
        <>
          <Button variant="ghost" onPress={() => {}}>
            2 MORE IDEAS
          </Button>
          <Button variant="primary" onPress={() => {}}>
            I&apos;M DOWN
          </Button>
        </>
      }
    >
      <Progress value={6} max={8} label="6 of 8 in" />
      <Text variant="label">6 / 8 IN · 2 SPOTS LEFT</Text>
    </Panel>
  ),
};

/** CrewHome › Ritual: a display-sm title. */
export const DisplayTitle: Story = {
  args: {
    overline: 'RITUAL',
    title: 'THURSDAY FOOTBALL.',
    titleVariant: 'display-sm',
    body: 'Every Thursday, 7:30, Jeanne-Mance. Prefilled each week; everyone still taps I’M DOWN.',
  },
  render: (args) => (
    <Panel
      {...args}
      actions={
        <>
          <Button variant="primary" onPress={() => {}}>
            THIS WEEK · 6 / 10
          </Button>
          <Button variant="ghost" onPress={() => {}}>
            SKIP A WEEK
          </Button>
        </>
      }
    />
  ),
};

/** States › Join the waitlist: title-sm, 8 gap, no overline. */
export const Compact: Story = {
  args: {
    overline: undefined,
    title: 'Join the waitlist',
    titleVariant: 'title-sm',
    body: '2 people ahead of you. If a spot opens before 7:00 you’re in automatically, and we tell you straight away.',
    gap: 8,
  },
  render: (args) => (
    <Panel
      {...args}
      actions={
        <Button variant="primary" onPress={() => {}}>
          JOIN WAITLIST
        </Button>
      }
    />
  ),
};

/** Only an overline and a title. */
export const Minimal: Story = {};

export const Situations: Story = {
  parameters: { ojoro: { padded: false } },
  render: (args) => (
    <EachSituation>
      <View>
        <Panel {...args} note="Shown as a count." />
      </View>
    </EachSituation>
  ),
};
