import type { Meta, StoryObj } from '@storybook/react-native';
import { View } from 'react-native';

import { EachSituation, onSituation } from '../stories/storyKit';
import { DataTable, type DataTableColumn, type DataTableRow } from './DataTable';

const columns: DataTableColumn[] = [
  {
    key: 'pos',
    title: '#',
    accessibilityLabel: 'Position',
    align: 'left',
    width: 24,
    strong: true,
  },
  { key: 'team', title: 'TEAM', align: 'left' },
  { key: 'p', title: 'P', accessibilityLabel: 'Played', width: 28 },
  { key: 'w', title: 'W', accessibilityLabel: 'Won', width: 28 },
  { key: 'd', title: 'D', accessibilityLabel: 'Drawn', width: 28 },
  { key: 'l', title: 'L', accessibilityLabel: 'Lost', width: 28 },
  { key: 'gd', title: 'GD', accessibilityLabel: 'Goal difference', width: 28 },
  { key: 'pts', title: 'PTS', accessibilityLabel: 'Points', width: 32, strong: true },
];

const table = [
  ['Mile End Strikers', 2, 2, 0, 0, '+4', 6],
  ['Thursday FC', 1, 1, 0, 0, '+1', 3],
  ['Lachine Locos', 2, 0, 2, 0, '0', 2],
  ['Plateau Crew', 1, 0, 1, 0, '0', 1],
  ['Saint-Henri United', 2, 0, 1, 1, '-2', 1],
  ['Concordia Old Boys', 2, 0, 0, 2, '-3', 0],
] as const;

const rows: DataTableRow[] = table.map(([team, p, w, d, l, gd, pts], i) => ({
  key: team,
  cells: { pos: i + 1, team, p, w, d, l, gd, pts },
}));

const meta = {
  title: 'Host/DataTable',
  component: DataTable,
  parameters: onSituation('calm'),
  args: { label: 'Standings', columns, rows, rowHeaderKey: 'team' },
} satisfies Meta<typeof DataTable>;

export default meta;

type Story = StoryObj<typeof meta>;

/** HostSeason standings. */
export const Standings: Story = {};

/** After a confirmed result: rows that moved are shaded, ruled on the left, and read "Moved". */
export const Highlighted: Story = {
  args: {
    highlightLabel: 'Moved',
    rows: rows.map((r) =>
      r.key === 'Thursday FC' || r.key === 'Plateau Crew' ? { ...r, highlighted: true } : r,
    ),
  },
};

/** HostInsights table view: compact, three columns. */
export const Compact: Story = {
  args: {
    label: 'People per week',
    density: 'compact',
    rowHeaderKey: undefined,
    columns: [
      { key: 'week', title: 'WEEK OF', align: 'left' },
      { key: 'people', title: 'PEOPLE', width: 72 },
      { key: 'sessions', title: 'SESSIONS', width: 72 },
    ],
    rows: [
      { key: '1', cells: { week: 'Sep 14', people: 31, sessions: 4 } },
      { key: '2', cells: { week: 'Sep 21', people: 54, sessions: 5 } },
      { key: '3', cells: { week: 'Sep 28', people: 58, sessions: 5 } },
    ],
  },
};

/** No rows yet. */
export const Empty: Story = {
  args: { rows: [], empty: 'No results yet. Standings start after round 1.' },
};

/** Too narrow for its columns: it scrolls sideways instead of squeezing. */
export const Narrow: Story = {
  render: (args) => (
    <View style={{ width: 240 }}>
      <DataTable {...args} />
    </View>
  ),
};

export const OnEachSituation: Story = {
  parameters: { ojoro: { padded: false } },
  render: (args) => (
    <EachSituation only={['calm', 'confirmed', 'after']}>
      <DataTable {...args} rows={args.rows.slice(0, 3)} />
    </EachSituation>
  ),
};
