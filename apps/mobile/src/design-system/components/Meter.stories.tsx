import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { EachSituation, onSituation } from '../stories/storyKit';
import { Meter } from './Meter';
import { Text } from './Text';

const meta = {
  title: 'Host/Meter',
  component: Meter,
  parameters: onSituation('calm'),
  args: { value: 98, label: 'Tuesday 7-a-side, 98 percent full on average' },
} satisfies Meta<typeof Meter>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { value: 0, label: 'New series, no sessions yet' } };
export const Full: Story = { args: { value: 100, label: 'Full every week' } };
/** Out of a max other than 100: 9 of 12 spots. */
export const OfMax: Story = { args: { value: 9, max: 12, label: '9 of 12 spots' } };
/** Over max: clamps to full. */
export const OverMax: Story = { args: { value: 140, label: 'Over capacity' } };

const rows = [
  ['Tuesday 7-a-side', 98, 'Fills in about 26 hours · 3% no-shows · 3 on the waitlist most weeks'],
  ['Thursday mixed 5s', 84, 'Usually 8 or 9 of 10 · 6% no-shows'],
  ['Sunday beginners', 71, '4 in 10 first-timers come back the next week'],
] as const;

/** HostInsights "By session": the number is always written beside the bar. */
export const BySession: Story = {
  render: () => (
    <View>
      {rows.map(([name, pct, meta]) => (
        <View key={name} className="gap-space-2 border-b border-line py-space-4">
          <View className="flex-row items-baseline justify-between gap-space-3">
            <Text variant="title-sm">{name}</Text>
            <Text variant="title-sm" style={{ fontVariant: ['tabular-nums'] }}>
              {pct}% full
            </Text>
          </View>
          <Meter value={pct} label={`${name}, ${pct} percent full on average`} />
          <Text variant="body-sm" muted>
            {meta}
          </Text>
        </View>
      ))}
    </View>
  ),
};

export const OnEachSituation: Story = {
  parameters: { ojoro: { padded: false } },
  render: (args) => (
    <EachSituation>
      <Meter {...args} />
    </EachSituation>
  ),
};
