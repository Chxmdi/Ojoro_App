import { describe, expect, it } from 'vitest';

import { canDecrease, canIncrease, clamp, stepValue, stepperText } from './Stepper.logic';

describe('clamp', () => {
  it('keeps values in bounds', () => {
    expect(clamp(5, 10, 18)).toBe(10);
    expect(clamp(20, 10, 18)).toBe(18);
    expect(clamp(14, 10, 18)).toBe(14);
  });
  it('treats NaN as the minimum and a max below min as min', () => {
    expect(clamp(Number.NaN, 2, 8)).toBe(2);
    expect(clamp(9, 5, 3)).toBe(5);
  });
});

describe('stepValue', () => {
  const players = { min: 10, max: 18, step: 2 };
  it('steps up and down by step', () => {
    expect(stepValue(14, 1, players)).toBe(16);
    expect(stepValue(14, -1, players)).toBe(12);
  });
  it('stops at the bounds', () => {
    expect(stepValue(18, 1, players)).toBe(18);
    expect(stepValue(10, -1, players)).toBe(10);
    expect(stepValue(17, 1, { min: 0, max: 18, step: 5 })).toBe(18);
  });
  it('snaps off-grid values to the grid', () => {
    expect(stepValue(13, 1, players)).toBe(14);
    expect(stepValue(13, -1, players)).toBe(12);
  });
  it('clamps an out-of-range start before stepping', () => {
    expect(stepValue(30, -1, players)).toBe(16);
    expect(stepValue(2, 1, players)).toBe(12);
  });
  it('handles fractional steps without float dust', () => {
    expect(stepValue(0.2, 1, { min: 0, max: 1, step: 0.1 })).toBe(0.3);
  });
  it('treats a zero or negative step as 1', () => {
    expect(stepValue(3, 1, { min: 0, max: 9, step: 0 })).toBe(4);
    expect(stepValue(3, -1, { min: 0, max: 9, step: -2 })).toBe(2);
  });
});

describe('bounds', () => {
  it('disables at the bounds', () => {
    expect(canDecrease(10, 10)).toBe(false);
    expect(canDecrease(11, 10)).toBe(true);
    expect(canIncrease(18, 18)).toBe(false);
    expect(canIncrease(17, 18)).toBe(true);
  });
});

describe('stepperText', () => {
  it('builds button names from the label', () => {
    const t = stepperText('Capacity', 14, 10, 18);
    expect(t.decrease).toBe('Decrease capacity');
    expect(t.increase).toBe('Increase capacity');
    expect(t.value).toBe('14');
    expect(t.decreaseReason).toBeUndefined();
    expect(t.increaseReason).toBeUndefined();
  });
  it('names the bound and the reason, using the format', () => {
    const fmt = (n: number) => `$${n}`;
    const low = stepperText('Drop-in price', 0, 0, 40, fmt);
    expect(low.value).toBe('$0, the minimum');
    expect(low.decreaseReason).toBe("Drop-in price can't go below $0.");
    const high = stepperText('Drop-in price', 40, 0, 40, fmt);
    expect(high.value).toBe('$40, the maximum');
    expect(high.increaseReason).toBe("Drop-in price can't go above $40.");
  });
});
