import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { EachSituation, Section } from '../stories/storyKit';
import { Badge, type BadgeTone } from './Badge';

const tones: BadgeTone[] = ['neutral', 'signal', 'verified'];

const meta = {
  title: 'Primitives/Badge',
  component: Badge,
  args: { tone: 'neutral', children: 'ACCEPTED' },
  argTypes: {
    tone: { control: { type: 'select' }, options: tones },
    children: { control: { type: 'text' } },
  },
} satisfies Meta<typeof Badge>;

export default meta;

type Story = StoryObj<typeof meta>;

/** One badge, driven by the controls. */
export const Playground: Story = {};

/** The three tones: outline, filled, check + strong outline. The word carries the meaning. */
export const Tones: Story = {
  render: () => (
    <View>
      <Section title="neutral">
        <View className="flex-row flex-wrap gap-space-2">
          <Badge>ACCEPTED</Badge>
          <Badge>7 / 8</Badge>
          <Badge>FULL</Badge>
        </View>
      </Section>
      <Section title="signal">
        <View className="flex-row flex-wrap gap-space-2">
          <Badge tone="signal">GAME ON</Badge>
          <Badge tone="signal">HOST</Badge>
          <Badge tone="signal">3 DAYS</Badge>
        </View>
      </Section>
      <Section title="verified">
        <View className="flex-row flex-wrap gap-space-2">
          <Badge tone="verified">VERIFIED</Badge>
          <Badge tone="verified">CHECKED IN</Badge>
        </View>
      </Section>
    </View>
  ),
};

/**
 * Every tone on every ground. On confirmed and live, `signal` is white, so the
 * filled badge inverts instead of putting oxblood on a dark ground.
 */
export const OnEachSituation: Story = {
  parameters: { ojoro: { padded: false } },
  render: () => (
    <EachSituation>
      <View className="flex-row flex-wrap gap-space-2">
        {tones.map((tone) => (
          <Badge key={tone} tone={tone}>
            {tone === 'verified' ? 'VERIFIED' : tone === 'signal' ? 'GAME ON' : 'ACCEPTED'}
          </Badge>
        ))}
      </View>
    </EachSituation>
  ),
};
