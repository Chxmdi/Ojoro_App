import { describe, expect, it } from 'vitest';

import {
  axisLabel,
  chartTicks,
  columnHeight,
  columnLabel,
  endLabel,
  readout,
  toggleLabel,
} from './ColumnChart.logic';

describe('chartTicks', () => {
  it('rounds the top to a clean step', () => {
    expect(chartTicks([38, 58, 31])).toEqual([0, 20, 40, 60]);
    expect(chartTicks([7])).toEqual([0, 5, 10, 15]);
    expect(chartTicks([412])).toEqual([0, 200, 400, 600]);
    expect(chartTicks([75])).toEqual([0, 25, 50, 75]);
  });
  it('keeps whole steps for tiny or empty series', () => {
    expect(chartTicks([])).toEqual([0, 1, 2, 3]);
    expect(chartTicks([0, 2])).toEqual([0, 1, 2, 3]);
    expect(chartTicks([4])).toEqual([0, 2, 4, 6]);
  });
});

describe('columnHeight', () => {
  it('scales to the top tick and clamps', () => {
    expect(columnHeight(58, 60, 180)).toBe(174);
    expect(columnHeight(90, 60, 180)).toBe(180);
    expect(columnHeight(-1, 60, 180)).toBe(0);
    expect(columnHeight(5, 0, 180)).toBe(0);
  });
});

describe('labels', () => {
  const d = { label: 'Sep 28', value: 58 };
  it('labels every nth column on the axis', () => {
    expect(axisLabel(d, 0)).toBe('SEP 28');
    expect(axisLabel(d, 1)).toBe('');
    expect(axisLabel(d, 4, 2)).toBe('SEP 28');
    expect(axisLabel({ ...d, axisLabel: 'NOW' }, 1)).toBe('NOW');
  });
  it('speaks each column and the readout', () => {
    expect(columnLabel(d, 'people')).toBe('Sep 28: 58 people');
    expect(columnLabel({ ...d, accessibilityLabel: 'x' }, 'people')).toBe('x');
    expect(readout(d, 'people')).toEqual({ value: '58 people', meta: 'Sep 28' });
    expect(readout({ ...d, meta: 'Week of Sep 28 · 5 sessions' }, 'people').meta).toBe(
      'Week of Sep 28 · 5 sessions',
    );
  });
  it('names the last column in words and the toggle by what it shows next', () => {
    expect(endLabel(58)).toBe('LAST WEEK · 58');
    expect(endLabel(3, 'THIS MONTH')).toBe('THIS MONTH · 3');
    expect(toggleLabel('chart')).toBe('SHOW AS TABLE');
    expect(toggleLabel('table')).toBe('SHOW AS CHART');
  });
});
