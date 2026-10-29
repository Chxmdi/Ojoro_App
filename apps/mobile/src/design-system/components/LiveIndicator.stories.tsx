import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { EachSituation, onSituation, Section } from '../stories/storyKit';
import { IconButton } from './IconButton';
import { LiveIndicator } from './LiveIndicator';
import { ReducedMotionOverride } from './Overlay';
import { Text } from './Text';

const meta = {
  title: 'Social/LiveIndicator',
  component: LiveIndicator,
  parameters: onSituation('live'),
  args: { testID: 'live' },
  argTypes: {
    label: { control: { type: 'text' } },
    decorative: { control: { type: 'boolean' } },
  },
} satisfies Meta<typeof LiveIndicator>;

export default meta;

type Story = StoryObj<typeof meta>;

/** LIVE on the live ground: the dot pulses on dur-live; the ring keeps oxblood off the black. */
export const Default: Story = {
  render: (args) => (
    <View className="flex-row">
      <LiveIndicator {...args} />
    </View>
  ),
};

/** Pulse: a custom word (SPARRING). Decorative there, as the map is described in words. */
export const CustomLabel: Story = {
  args: { label: 'SPARRING', decorative: true },
  render: (args) => (
    <View className="flex-row">
      <LiveIndicator {...args} />
    </View>
  ),
};

/** Reduced motion: the dot holds still at full opacity. The word still says LIVE. */
export const ReducedMotion: Story = {
  render: (args) => (
    <ReducedMotionOverride value>
      <View className="flex-row">
        <LiveIndicator {...args} />
      </View>
    </ReducedMotionOverride>
  ),
};

/** LiveActivity's header: back, LIVE, the clock, share. */
export const InHeader: Story = {
  parameters: onSituation('live', { padded: false }),
  render: () => (
    <View className="flex-row items-center gap-space-3 px-space-2 pt-space-2">
      <IconButton icon="back" label="Back" />
      <LiveIndicator />
      <Text variant="numeric" muted>
        34:12
      </Text>
      <View className="ml-auto">
        <IconButton icon="share" label="Share live game" />
      </View>
    </View>
  ),
};

/** Oxblood on every ground, always with the white mark-ring. */
export const OnEachSituation: Story = {
  parameters: { ojoro: { padded: false } },
  render: () => (
    <EachSituation>
      <View className="flex-row gap-space-4">
        <LiveIndicator />
        <LiveIndicator label="SPARRING" decorative />
      </View>
    </EachSituation>
  ),
};

/** Moving and still, side by side. */
export const States: Story = {
  render: () => (
    <View>
      <Section title="Pulsing">
        <View className="flex-row">
          <LiveIndicator />
        </View>
      </Section>
      <Section title="Reduced motion">
        <ReducedMotionOverride value>
          <View className="flex-row">
            <LiveIndicator />
          </View>
        </ReducedMotionOverride>
      </Section>
    </View>
  ),
};
