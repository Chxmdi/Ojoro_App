import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { EachSituation } from '../stories/storyKit';
import { Stepper, type StepperProps } from './Stepper';

function Controlled(props: Omit<StepperProps, 'onChange'>) {
  const [value, setValue] = useState(props.value);
  return <Stepper {...props} value={value} onChange={setValue} />;
}

const players = {
  label: 'Players',
  hint: '7 a side. Ojoro balances teams at check-in.',
  min: 10,
  max: 18,
  step: 2,
};

const dollars = (n: number) => `$${n}`;

const meta = {
  title: 'Primitives/Stepper',
  component: Stepper,
  args: { ...players, value: 14 },
  argTypes: {
    value: { control: { type: 'number' } },
    min: { control: { type: 'number' } },
    max: { control: { type: 'number' } },
    step: { control: { type: 'number' } },
    label: { control: { type: 'text' } },
    hint: { control: { type: 'text' } },
  },
  render: (args) => <Controlled {...args} />,
} satisfies Meta<typeof Stepper>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** At the minimum: − is dimmed and says why ("Players can't go below 10."). */
export const AtMin: Story = { args: { value: 10 } };

export const Mid: Story = { args: { value: 14 } };

/** At the maximum: + is dimmed and says why. */
export const AtMax: Story = { args: { value: 18 } };

/** `format` shows money; the bounds are spoken in the same format. */
export const Money: Story = {
  args: { label: 'Drop-in price', hint: undefined, value: 12, min: 0, max: 40, step: 1, format: dollars },
};

export const Capacity: Story = {
  args: { label: 'Capacity', hint: 'Including you.', value: 8, min: 2, max: 30, step: 1 },
};

export const States: Story = {
  render: () => (
    <View className="gap-space-6">
      <Controlled {...players} value={10} />
      <Controlled {...players} value={14} />
      <Controlled {...players} value={18} />
      <Controlled label="Drop-in price" value={12} min={0} max={40} format={dollars} />
    </View>
  ),
};

/** Host screens are calm; checked on all five grounds. */
export const OnEachSituation: Story = {
  render: () => (
    <EachSituation>
      <Controlled {...players} value={10} />
      <Controlled {...players} value={14} />
    </EachSituation>
  ),
};
