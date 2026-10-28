import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { EachSituation, onSituation, Section } from '../stories/storyKit';
import { Progress } from './Progress';
import { Stepper } from './Stepper';

const meta = {
  title: 'Primitives/Progress',
  component: Progress,
  args: { value: 6, max: 8, label: '6 of 8 committed' },
  argTypes: {
    value: { control: { type: 'number' } },
    max: { control: { type: 'number' } },
    label: { control: { type: 'text' } },
  },
} satisfies Meta<typeof Progress>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Empty: Story = { args: { value: 0, label: '0 of 8 in' } };

/** Plan capacity on the forming ground, as in Plan.png. */
export const Partial: Story = { args: { value: 6, label: '6 of 8 in' }, parameters: onSituation('forming') };

export const Full: Story = { args: { value: 14, max: 14, label: '14 of 14 in' } };

/** Over max shows full and says "8 of 8". */
export const OverMax: Story = { args: { value: 11, max: 8, label: undefined } };

/** Onboarding steps: few, wide segments. */
export const Steps: Story = { args: { value: 2, max: 3, label: 'Step 2 of 3' } };

function Gathering() {
  const [value, setValue] = useState(3);
  return (
    <View className="gap-space-4">
      <Progress value={value} label={`${value} of 8 in`} />
      <Stepper label="People in" value={value} min={0} max={8} onChange={setValue} />
    </View>
  );
}

/** Press +: the new segment fills on dur-gather (instant under reduced motion). */
export const Gather: Story = { render: () => <Gathering />, parameters: onSituation('forming') };

/** 0, partial, full and over max on every ground it appears on. */
export const OnEachSituation: Story = {
  render: () => (
    <EachSituation>
      <Section title="0 · 6 · 8 · 11 of 8">
        <Progress value={0} />
        <Progress value={6} />
        <Progress value={8} />
        <Progress value={11} />
      </Section>
    </EachSituation>
  ),
};
