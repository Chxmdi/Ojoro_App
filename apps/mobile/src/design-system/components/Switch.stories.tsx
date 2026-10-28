import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { EachSituation } from '../stories/storyKit';
import { Switch, type SwitchProps } from './Switch';

function Controlled(props: Omit<SwitchProps, 'onValueChange'>) {
  const [value, setValue] = useState(props.value);
  return <Switch {...props} value={value} onValueChange={setValue} />;
}

const meta = {
  title: 'Primitives/Switch',
  component: Switch,
  args: {
    value: true,
    label: 'Approve first-timers',
    description:
      "People who've played with you before join straight away. New faces wait for your OK.",
    disabled: false,
  },
  argTypes: {
    value: { control: { type: 'boolean' } },
    label: { control: { type: 'text' } },
    description: { control: { type: 'text' } },
    disabled: { control: { type: 'boolean' } },
  },
  render: (args) => <Controlled {...args} />,
} satisfies Meta<typeof Switch>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const On: Story = { args: { value: true } };

export const Off: Story = {
  args: {
    value: false,
    label: '3 or more checked-in games',
    description: 'Anyone who has shown up to at least 3 Ojoro games, anywhere.',
  },
};

export const DisabledOn: Story = { args: { value: true, disabled: true } };

export const DisabledOff: Story = { args: { value: false, disabled: true } };

/** Label only, no description. */
export const LabelOnly: Story = {
  args: { value: false, label: 'Members first', description: undefined },
};

/** The LET THESE STRAIGHT IN rows from HostRequests. Press a row to toggle. */
export const Rows: Story = {
  render: () => (
    <View>
      <Controlled
        value
        label="People who've played with you"
        description="Anyone who checked in to one of your sessions before."
      />
      <Controlled
        value={false}
        label="3 or more checked-in games"
        description="Anyone who has shown up to at least 3 Ojoro games, anywhere."
      />
      <Controlled
        value
        label="Your Crews"
        description="Members of Plateau Pickup and Thursday FC."
      />
    </View>
  ),
};

/** Settings live on calm host screens; checked on all five grounds. */
export const OnEachSituation: Story = {
  render: () => (
    <EachSituation>
      <Controlled
        value
        label="Waitlist that fills itself"
        description="When someone drops, the next person is in."
      />
      <Controlled value={false} label="Members first" />
      <Controlled value disabled label="Approve first-timers" />
    </EachSituation>
  ),
};
