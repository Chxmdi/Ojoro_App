import type { Meta, StoryObj } from '@storybook/react-native';

import { EachSituation, onSituation } from '../stories/storyKit';
import { formatMoney } from './Ledger.logic';
import { StatTile, StatTiles } from './StatTile';

const meta = {
  title: 'Host/StatTile',
  component: StatTile,
  parameters: onSituation('calm'),
  args: { value: '91%', label: 'Showed up', delta: '+3 pts on the 30 days before' },
} satisfies Meta<typeof StatTile>;

export default meta;

type Story = StoryObj<typeof meta>;

/** One tile: value, what it counts, change in words. */
export const Single: Story = {};

/** No delta (first period, nothing to compare). */
export const NoDelta: Story = { args: { delta: undefined } };

/** HostHome's compact form: caption label, no delta. */
export const Compact: Story = { args: { value: '26', label: 'Sessions', compact: true } };

/** HostInsights "Key numbers": two to a row, hairline rules. */
export const InsightsGrid: Story = {
  render: () => (
    <StatTiles label="Key numbers">
      <StatTile value="91%" label="Showed up" delta="+3 pts on the 30 days before" />
      <StatTile value="64%" label="Came back within 2 weeks" delta="+5 pts" />
      <StatTile value="1 DAY" label="For Tuesday to fill" delta="4 hours faster" />
      <StatTile value={formatMoney(154400, 'USD')} label="Paid out to you" delta="+12%" />
    </StatTiles>
  ),
};

/** HostHome "Last 30 days": three across, unruled. */
export const HomeRow: Story = {
  render: () => (
    <StatTiles label="Last 30 days" columns={3} ruled={false}>
      <StatTile compact value="26" label="Sessions" />
      <StatTile compact value="91%" label="Showed up" />
      <StatTile compact value="412" label="Ojoro hours" />
    </StatTiles>
  ),
};

/** Odd count: the last row keeps its column widths. */
export const OddCount: Story = {
  render: () => (
    <StatTiles label="Key numbers">
      <StatTile value="91%" label="Showed up" />
      <StatTile value="64%" label="Came back" />
      <StatTile value="0" label="No-shows this week" delta="Same as last week" />
    </StatTiles>
  ),
};

/** Empty period: zeros as counts, never dashes. */
export const ZeroState: Story = {
  render: () => (
    <StatTiles label="Key numbers">
      <StatTile value="0%" label="Showed up" delta="No sessions yet" />
      <StatTile
        value={formatMoney(0, 'USD')}
        label="Paid out to you"
        delta="Payments not connected"
      />
    </StatTiles>
  ),
};

/** On each ground. */
export const OnEachSituation: Story = {
  parameters: { ojoro: { padded: false } },
  render: () => (
    <EachSituation>
      <StatTiles label="Key numbers">
        <StatTile value="91%" label="Showed up" delta="+3 pts" />
        <StatTile value="64%" label="Came back" delta="+5 pts" />
      </StatTiles>
    </EachSituation>
  ),
};
