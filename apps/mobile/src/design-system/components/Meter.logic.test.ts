import { describe, expect, it } from 'vitest';

import { meterModel } from './Meter.logic';

describe('meterModel', () => {
  it('gives a percentage of max', () => {
    expect(meterModel(98)).toEqual({ pct: 98, now: 98, max: 100 });
    expect(meterModel(3, 4)).toEqual({ pct: 75, now: 3, max: 4 });
  });
  it('clamps and survives bad input', () => {
    expect(meterModel(140).pct).toBe(100);
    expect(meterModel(-5).pct).toBe(0);
    expect(meterModel(Number.NaN).pct).toBe(0);
    expect(meterModel(5, 0)).toEqual({ pct: 5, now: 5, max: 100 });
  });
});
