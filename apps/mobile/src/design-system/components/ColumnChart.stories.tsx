import type { Meta, StoryObj } from '@storybook/react-native';

import { EachSituation, onSituation } from '../stories/storyKit';
import { ColumnChart, type ColumnChartDatum } from './ColumnChart';

const labels = [
  'Jul 13',
  'Jul 20',
  'Jul 27',
  'Aug 3',
  'Aug 10',
  'Aug 17',
  'Aug 24',
  'Aug 31',
  'Sep 7',
  'Sep 14',
  'Sep 21',
  'Sep 28',
];
const people = [38, 41, 44, 40, 47, 52, 49, 45, 50, 31, 54, 58];
const sessions = [4, 4, 4, 4, 5, 5, 5, 5, 5, 4, 5, 5];

const weeks: ColumnChartDatum[] = labels.map((label, i) => ({
  label,
  value: people[i]!,
  meta: `Week of ${label} · ${sessions[i]} sessions${i === 9 ? ' · Thursday rained out' : ''}`,
  extra: { sessions: sessions[i]! },
  accessibilityLabel: `Week of ${label}: ${people[i]} people, ${sessions[i]} sessions`,
}));

const meta = {
  title: 'Host/ColumnChart',
  component: ColumnChart,
  parameters: onSituation('calm'),
  args: {
    title: 'People per week',
    data: weeks,
    unit: 'people',
    extraColumns: [{ key: 'sessions', title: 'SESSIONS' }],
    caption: 'The dip in mid-September is the Thursday rain-out.',
  },
  argTypes: { view: { control: { type: 'select' }, options: [undefined, 'chart', 'table'] } },
} satisfies Meta<typeof ColumnChart>;

export default meta;

type Story = StoryObj<typeof meta>;

/** HostInsights: 12 weeks, last week in ink and labelled in words. Hover, focus or tap a column. */
export const Chart: Story = {};

/** The table view: the same numbers as rows (SHOW AS CHART to go back). */
export const Table: Story = { args: { view: 'table' } };

/** Few points, no extra columns, custom end label. */
export const Short: Story = {
  args: {
    title: 'Sessions per month',
    unit: 'sessions',
    lastLabel: 'THIS MONTH',
    xLabelEvery: 1,
    categoryTitle: 'MONTH',
    extraColumns: [],
    caption: undefined,
    data: [
      { label: 'Jul', value: 18 },
      { label: 'Aug', value: 22 },
      { label: 'Sep', value: 21 },
      { label: 'Oct', value: 9 },
    ],
  },
};

/** No activity yet: flat columns on a 0–3 scale, still labelled. */
export const Zeros: Story = {
  args: {
    caption: undefined,
    data: labels.slice(0, 4).map((label) => ({ label, value: 0, extra: { sessions: 0 } })),
  },
};

/** Seeded case: the last column is shorter than its neighbours, so LAST WEEK · 17 sits above the tallest column it spans. */
export const ShortLast: Story = {
  args: {
    title: 'People per week',
    lastLabel: 'THIS WEEK',
    caption: undefined,
    data: weeks.map((w, i) =>
      i === weeks.length - 1 ? { ...w, value: 17, meta: 'Week of Sep 28 · 2 sessions so far' } : w,
    ),
  },
};

export const OnEachSituation: Story = {
  parameters: { ojoro: { padded: false } },
  render: (args) => (
    <EachSituation only={['calm', 'forming', 'after']}>
      <ColumnChart {...args} />
    </EachSituation>
  ),
};
