import { describe, expect, it } from 'vitest';

import { formatCount } from './formatCount';

describe('formatCount', () => {
  it('shows no badge for missing, zero or negative counts', () => {
    expect(formatCount(undefined)).toBeNull();
    expect(formatCount(null)).toBeNull();
    expect(formatCount(0)).toBeNull();
    expect(formatCount(-2)).toBeNull();
    expect(formatCount(Number.NaN)).toBeNull();
    expect(formatCount(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('shows 1 to 9 as the number', () => {
    expect(formatCount(1)).toBe('1');
    expect(formatCount(3)).toBe('3');
    expect(formatCount(9)).toBe('9');
  });

  it('caps at 9+', () => {
    expect(formatCount(10)).toBe('9+');
    expect(formatCount(240)).toBe('9+');
  });

  it('drops fractions', () => {
    expect(formatCount(2.7)).toBe('2');
    expect(formatCount(0.5)).toBeNull();
  });
});
