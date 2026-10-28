import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { EachSituation, Section } from '../stories/storyKit';
import { AvatarCluster, type Person } from './AvatarCluster';
import { Button } from './Button';
import { Text } from './Text';

/** Sample people from the Plan and States designs. */
const PEOPLE: Person[] = [
  { name: 'Ade B' },
  { name: 'Chimdi O' },
  { name: 'Marcus T' },
  { name: 'Lena R' },
  { name: 'Sam K' },
  { name: 'Yara M' },
  { name: 'Theo L' },
  { name: 'Nia P' },
];

const meta = {
  title: 'Social/AvatarCluster',
  component: AvatarCluster,
  args: { people: PEOPLE.slice(0, 6), total: 6, max: 6, open: 2, size: 'sm' },
  argTypes: {
    size: { control: { type: 'select' }, options: ['sm', 'md'] },
    total: { control: { type: 'number' } },
    max: { control: { type: 'number' } },
    open: { control: { type: 'number' } },
  },
} satisfies Meta<typeof AvatarCluster>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Plan › 6 / 8: six in, two dashed open spots. Reads "6 people in, 2 open". */
export const Default: Story = {};

/** Every shape the cluster takes. */
export const Variants: Story = {
  render: () => (
    <View>
      <Section title="OPEN SPOTS · 6 IN, 2 OPEN">
        <AvatarCluster people={PEOPLE.slice(0, 6)} total={6} max={6} open={2} />
      </Section>
      <Section title="OVERFLOW · DEFAULT MAX 5, +N">
        <AvatarCluster people={PEOPLE} total={14} />
      </Section>
      <Section title="FEW · 3 IN">
        <AvatarCluster people={PEOPLE.slice(0, 3)} />
      </Section>
      <Section title="EMPTY · 0 IN, 2 OPEN">
        <AvatarCluster people={[]} open={2} />
      </Section>
      <Section title="SIZE MD">
        <AvatarCluster people={PEOPLE.slice(0, 4)} total={9} max={4} open={1} size="md" />
      </Section>
    </View>
  ),
};

/** Gather: each join flies the new person in; the cluster gets denser. */
export const Gather: Story = {
  render: function GatherStory() {
    const [n, setN] = useState(4);
    const people = PEOPLE.slice(0, n).map((p, i) =>
      i === n - 1 && n > 4 ? { ...p, isNew: true } : p,
    );
    return (
      <View className="gap-space-4">
        <AvatarCluster people={people} total={n} max={8} open={Math.min(2, 8 - n)} />
        <Text variant="body-sm" muted>{`${n} / 8`}</Text>
        <View className="flex-row gap-space-3">
          <Button
            variant="secondary"
            onPress={() => setN((v) => Math.min(8, v + 1))}
            disabled={n >= 8}
          >
            SOMEONE JOINS
          </Button>
          <Button variant="ghost" onPress={() => setN(4)}>
            RESET
          </Button>
        </View>
      </View>
    );
  },
};

/** The 2px ground ring follows the situation, so avatars separate on every ground. */
export const OnEachSituation: Story = {
  render: () => (
    <EachSituation>
      <AvatarCluster people={PEOPLE.slice(0, 6)} total={9} max={6} open={1} />
    </EachSituation>
  ),
  parameters: { ojoro: { padded: false } },
};
