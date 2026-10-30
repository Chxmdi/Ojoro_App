import { describe, expect, it } from 'vitest';

import { statTileLabel, tileRows } from './StatTile.logic';

describe('statTileLabel', () => {
  it('reads value, label and delta as one sentence', () => {
    expect(statTileLabel('91%', 'Showed up', '+3 pts on the 30 days before')).toBe(
      '91%, showed up. +3 pts on the 30 days before.',
    );
    expect(statTileLabel('26', 'Sessions')).toBe('26, sessions.');
  });
});

describe('tileRows', () => {
  it('chunks into rows', () => {
    expect(tileRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(tileRows([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
    expect(tileRows([1, 2], 0)).toEqual([[1], [2]]);
    expect(tileRows([], 2)).toEqual([]);
  });
});
