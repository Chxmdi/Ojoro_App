import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { EachSituation, onSituation } from '../stories/storyKit';
import { PredictionBar, type PredictionPick } from './PredictionBar';
import { Text } from './Text';

const meta = {
  title: 'Competition/PredictionBar',
  component: PredictionBar,
  parameters: onSituation('forming'),
  args: {
    a: { name: 'Chimdi', pct: 48 },
    b: { name: 'Marcus', pct: 52 },
    picked: 'a',
  },
  argTypes: {
    picked: { control: { type: 'select' }, options: [undefined, 'a', 'b'] },
    locked: { control: { type: 'boolean' } },
  },
} satisfies Meta<typeof PredictionBar>;

export default meta;

type Story = StoryObj<typeof meta>;

/** EventBuildup: CHIMDI 48% YOUR PICK · 52% MARCUS, signal against tint with a gap. */
export const Picked: Story = {};

/** No pick yet: no badge. */
export const NotPicked: Story = { args: { picked: undefined } };

/** Your pick is side b: the badge sits before its percentage. */
export const PickedB: Story = { args: { picked: 'b' } };

/** EventToday: on the confirmed ground the bar is white against stone. */
export const OnConfirmed: Story = {
  parameters: onSituation('confirmed'),
  args: { a: { name: 'Chimdi', pct: 46 }, b: { name: 'Marcus', pct: 54 } },
};

/** Locked once the race is live: a LOCKED badge, no picking. */
export const Locked: Story = {
  parameters: onSituation('live'),
  args: { a: { name: 'Chimdi', pct: 46 }, b: { name: 'Marcus', pct: 54 }, locked: true },
};

/** Empty: nobody has picked. 0% each over an empty track. */
export const Empty: Story = {
  args: { a: { name: 'Chimdi', pct: 0 }, b: { name: 'Marcus', pct: 0 }, picked: undefined },
};

/** Raw counts are normalised and always sum to 100 (1 : 2 → 33% / 67%). */
export const FromCounts: Story = {
  args: { a: { name: 'Chimdi', pct: 1 }, b: { name: 'Marcus', pct: 2 }, picked: undefined },
};

function Interactive() {
  const [picked, setPicked] = useState<PredictionPick | undefined>();
  const a = { name: 'Chimdi', pct: 48 + (picked === 'a' ? 1 : 0) };
  const b = { name: 'Marcus', pct: 52 + (picked === 'b' ? 1 : 0) };
  return (
    <View className="gap-space-3">
      <PredictionBar a={a} b={b} picked={picked} onPick={setPicked} />
      <Text variant="caption" muted>
        Social only: no money, no points, no odds.
      </Text>
    </View>
  );
}

/** With `onPick`: each side is a radio. Tap a side to pick it. */
export const Choosing: Story = { render: () => <Interactive /> };

/** On each ground a Challenge Event shows predictions on. */
export const OnEachSituation: Story = {
  parameters: { ojoro: { padded: false } },
  render: (args) => (
    <EachSituation only={['forming', 'confirmed', 'live']}>
      <PredictionBar {...args} />
    </EachSituation>
  ),
};
