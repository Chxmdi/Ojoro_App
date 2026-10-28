import { situationIds, situations, type SituationId } from '@ojoro/design-tokens';
import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { Icon } from '../components/Icon';
import { Text } from '../components/Text';
import { Situation, useSituation } from '../Situation';
import { Section, situationNames } from './storyKit';

/** What each ground is for (design-system README). */
const purpose: Record<SituationId, string> = {
  calm: 'Everyday ground. Feeds, profiles, settings.',
  forming: 'A plan is gathering people.',
  confirmed: 'GAME ON. The plan is locked.',
  live: 'Happening now. Competition ground.',
  after: 'Archive, recap, Passport.',
};

/** A sample object on the nearest situation: overline, headline, body, signal block. */
function Ground() {
  const id = useSituation();
  return (
    <View className="gap-space-3">
      <View className="flex-row items-center justify-between">
        <Text variant="overline">{situationNames[id]}</Text>
        <Text variant="numeric" muted>
          surface {situations[id].surface}
        </Text>
      </View>
      <Text variant="display-sm">{id === 'confirmed' ? 'GAME ON' : id}</Text>
      <Text variant="body">{purpose[id]}</Text>
      <View className="flex-row items-center gap-space-2">
        <Icon name="clock" size={20} />
        <Text variant="body-sm" muted>
          Tonight · 7:30 PM
        </Text>
      </View>
      <View className="h-touch items-center justify-center rounded-pill bg-signal px-space-6 self-start">
        <Text variant="label" tone="on-signal">
          I&apos;M DOWN
        </Text>
      </View>
    </View>
  );
}

const meta = {
  title: 'Foundations/Situations',
  component: Ground,
  parameters: { ojoro: { padded: false } },
} satisfies Meta<typeof Ground>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The five grounds, in forward order. */
export const Grounds: Story = {
  render: () => (
    <View>
      {situationIds.map((id) => (
        <Situation key={id} id={id} className="p-space-5">
          <Ground />
        </Situation>
      ))}
    </View>
  ),
};

/** A GAME ON object sets confirmed on its own root inside a calm feed. */
export const ConfirmedInsideCalm: Story = {
  render: () => (
    <View className="p-space-5">
      <Section title="Calm feed">
        <Text variant="body">Down for football this week.</Text>
        <Situation id="confirmed" className="p-space-5">
          <Ground />
        </Situation>
        <Text variant="body-sm" muted>
          The feed around it stays calm.
        </Text>
      </Section>
    </View>
  ),
};

/** A live object inside calm, with a confirmed object nested in it. */
export const LiveInsideCalm: Story = {
  render: () => (
    <View className="p-space-5">
      <Section title="Calm feed">
        <Situation id="live" className="gap-space-4 p-space-5">
          <Ground />
          {/* Oxblood on black merges (1.09:1), so the nested block carries mark-ring. */}
          <Situation id="confirmed" className="border-2 border-mark-ring p-space-4">
            <Text variant="label">Nested confirmed</Text>
            <Text variant="body-sm" muted>
              Situations nest: tokens re-resolve for each subtree.
            </Text>
          </Situation>
        </Situation>
        <Text variant="body-sm" muted>
          Back on calm after the live block.
        </Text>
      </Section>
    </View>
  ),
};
