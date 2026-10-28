import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { onSituation } from '../stories/storyKit';
import { AvailabilityGrid, type AvailabilitySlot } from './AvailabilityGrid';
import { Text } from './Text';

const onboard: AvailabilitySlot[] = [
  'tue-evening',
  'wed-evening',
  'thu-evening',
  'sat-morning',
  'sun-morning',
];

const meta = {
  title: 'Primitives/AvailabilityGrid',
  component: AvailabilityGrid,
  args: { value: onboard },
  argTypes: { disabled: { control: { type: 'boolean' } } },
  parameters: onSituation('calm'),
} satisfies Meta<typeof AvailabilityGrid>;

export default meta;

type Story = StoryObj<typeof meta>;

/** OnboardWhen: tap a cell to toggle it. Free cells say FREE; the rest are empty boxes. */
export const Interactive: Story = {
  render: function Render() {
    const [value, setValue] = useState<AvailabilitySlot[]>(onboard);
    return (
      <View className="gap-space-3">
        <Text variant="body">
          Rough is fine. Ojoro uses it to suggest times, and only ever shows overlap, never your
          calendar.
        </Text>
        <AvailabilityGrid value={value} onChange={setValue} testID="grid" />
      </View>
    );
  },
};

/** Nothing set yet. */
export const Empty: Story = { args: { value: [] } };

/** Read-only (disabled), e.g. while saving. */
export const Disabled: Story = { args: { disabled: true } };

/** Weekend only, two parts of the day. */
export const Subset: Story = {
  args: { value: ['sat-morning'], days: ['sat', 'sun'], parts: ['morning', 'evening'] },
};
