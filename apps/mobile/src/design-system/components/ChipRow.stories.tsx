import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { onSituation } from '../stories/storyKit';
import { Chip } from './Chip';
import { ChipRow, type ChipRowProps } from './ChipRow';
import { Input } from './Input';

const FILTERS = ['Everything', 'Activities', 'People', 'Crews & Clans'];

function Filters(props: ChipRowProps) {
  const [selected, setSelected] = useState('Everything');
  return (
    <View className="gap-space-4" testID="search">
      <Input label="Search" icon="search" placeholder="Activities, people, Clans, places" />
      <ChipRow {...props}>
        {FILTERS.map((f) => (
          <Chip key={f} selected={selected === f} onPress={() => setSelected(f)}>
            {f}
          </Chip>
        ))}
      </ChipRow>
    </View>
  );
}

const meta = {
  title: 'Primitives/ChipRow',
  component: ChipRow,
  args: { label: 'Filter' },
  parameters: onSituation('calm'),
} satisfies Meta<typeof ChipRow>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Discover › Search: filters overflow past the gutter on purpose. Tap to select. */
export const Scroll: Story = {
  render: (args) => <Filters {...args} />,
};

/** FirstHome › Say what you're down for: chips wrap. */
export const Wrap: Story = {
  args: { label: 'Quick Down For', layout: 'wrap', testID: 'chips' },
  render: (args) => (
    <ChipRow {...args}>
      {['Football tonight', 'Run this week', 'Boxing this weekend', 'Something else'].map((c) => (
        <Chip key={c} onPress={() => {}}>
          {c}
        </Chip>
      ))}
    </ChipRow>
  ),
};

/** No bleed, for a row that already reaches the screen edge. */
export const NoBleed: Story = {
  args: { bleed: 0 },
  render: (args) => (
    <ChipRow {...args}>
      {['Everything', 'Football', 'Running', 'Boxing', 'Basketball'].map((c, i) => (
        <Chip key={c} selected={i === 0} onPress={() => {}}>
          {c}
        </Chip>
      ))}
    </ChipRow>
  ),
};
