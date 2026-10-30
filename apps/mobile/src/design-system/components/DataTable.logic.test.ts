import { describe, expect, it } from 'vitest';

import {
  FLEX_COLUMN_MIN,
  columnName,
  rowHeaderKey,
  rowLabel,
  tableMinWidth,
} from './DataTable.logic';

const columns = [
  { key: 'pos', title: '#', accessibilityLabel: 'Position', width: 24, align: 'left' as const },
  { key: 'team', title: 'TEAM', align: 'left' as const },
  { key: 'p', title: 'P', accessibilityLabel: 'Played', width: 28 },
  { key: 'pts', title: 'PTS', accessibilityLabel: 'Points', width: 32 },
];

describe('rowHeaderKey', () => {
  it('prefers the given key, else the first left column', () => {
    expect(rowHeaderKey(columns, 'team')).toBe('team');
    expect(rowHeaderKey(columns, 'nope')).toBe('pos');
    expect(rowHeaderKey([{ key: 'a', title: 'A' }])).toBe('a');
    expect(rowHeaderKey([])).toBeUndefined();
  });
});

describe('tableMinWidth', () => {
  it('sums fixed widths and a floor for flexible ones', () => {
    expect(tableMinWidth(columns)).toBe(24 + FLEX_COLUMN_MIN + 28 + 32);
    // Standings (#, team, six numbers) fit a 390pt screen with 20pt gutters.
    expect(24 + FLEX_COLUMN_MIN + 5 * 28 + 32).toBeLessThanOrEqual(350);
  });
});

describe('columnName', () => {
  it('uses the spoken name, else the title in sentence case', () => {
    expect(columnName(columns[2]!)).toBe('Played');
    expect(columnName({ key: 'w', title: 'WEEK OF' })).toBe('Week of');
  });
});

describe('rowLabel', () => {
  const cells = { pos: 1, team: 'Mile End Strikers', p: 2, pts: 6 };
  it('reads the row header, then each cell with its column', () => {
    expect(rowLabel(columns, cells, 'team')).toBe(
      'Mile End Strikers. Position 1, Played 2, Points 6.',
    );
  });
  it('adds the highlight in words and skips empty cells', () => {
    expect(rowLabel(columns, { ...cells, p: '' }, 'team', 'Moved')).toBe(
      'Mile End Strikers. Position 1, Points 6. Moved.',
    );
  });
  it('works without a header column', () => {
    expect(rowLabel(columns, { p: 3 }, undefined)).toBe('Played 3.');
  });
});
