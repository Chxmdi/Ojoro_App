import type { Meta, StoryObj } from '@storybook/react-native';

import { EachSituation, onSituation } from '../stories/storyKit';
import { Ledger } from './Ledger';

const payout = [
  { label: 'Drop-ins', count: 22, unitCents: 800, amountCents: 17600 },
  { label: 'Monthly renewals', count: 6, unitCents: 3500, amountCents: 21000 },
  { label: '10-pack', count: 1, unitCents: 7000, amountCents: 7000 },
  { label: 'Refunds', amountCents: -800 },
  { label: 'Ojoro service fee', amountCents: -3600 },
];

const meta = {
  title: 'Host/Ledger',
  component: Ledger,
  parameters: onSituation('calm'),
  args: { lines: payout, currency: 'USD', total: { label: 'You get' }, label: 'Next payout' },
} satisfies Meta<typeof Ledger>;

export default meta;

type Story = StoryObj<typeof meta>;

/** HostMembership: next payout, total summed from the lines. */
export const Payout: Story = {};

/** HostInsights revenue, with an explicit total. */
export const Revenue: Story = {
  args: {
    label: 'Revenue, last 30 days',
    lines: [
      { label: 'Memberships', count: 18, unitCents: 3500, amountCents: 63000 },
      { label: 'Drop-ins', count: 85, unitCents: 800, amountCents: 68000 },
      { label: '10-packs', count: 5, unitCents: 7000, amountCents: 35000 },
      { label: 'Refunds', amountCents: -3200 },
      { label: 'Ojoro service fee', amountCents: -8400 },
    ],
    total: { label: 'Paid out to you', amountCents: 154400 },
  },
};

/** No total row. */
export const LinesOnly: Story = { args: { total: undefined } };

/** Notes in words: a pending refund, a placeholder fee. */
export const WithNotes: Story = {
  args: {
    lines: [
      { label: 'Drop-ins', count: 22, unitCents: 850, amountCents: 18700 },
      { label: 'Refunds', amountCents: -3500, note: 'pending' },
      { label: 'Ojoro service fee', amountCents: -1870, note: 'placeholder rate' },
    ],
  },
};

/** Payments not connected: zero amounts, said in words. */
export const NotConnected: Story = {
  args: {
    lines: [{ label: 'Payments', amountCents: 0, note: 'not connected' }],
    total: { label: 'You get', note: 'nothing moves until payments are set up' },
  },
};

/** Other currencies come from the code, never from copy. */
export const Euro: Story = { args: { currency: 'EUR', locale: 'de-DE' } };

export const OnEachSituation: Story = {
  parameters: { ojoro: { padded: false } },
  render: (args) => (
    <EachSituation only={['calm', 'forming', 'after']}>
      <Ledger {...args} />
    </EachSituation>
  ),
};
