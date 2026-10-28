import { describe, expect, it } from 'vitest';

import { DEFAULT_MAX, newlyFilled, progressModel } from './Progress.logic';

describe('progressModel', () => {
  it('defaults to 8 segments and says the count', () => {
    const m = progressModel(6);
    expect(m.max).toBe(DEFAULT_MAX);
    expect(m.now).toBe(6);
    expect(m.segments).toEqual([true, true, true, true, true, true, false, false]);
    expect(m.label).toBe('6 of 8');
  });
  it('uses the caller label', () => {
    expect(progressModel(6, 8, '6 of 8 committed').label).toBe('6 of 8 committed');
  });
  it('is empty at 0, undefined or negative', () => {
    expect(progressModel(0, 4).segments).toEqual([false, false, false, false]);
    expect(progressModel(undefined, 3).now).toBe(0);
    expect(progressModel(-2, 3).now).toBe(0);
  });
  it('shows full when over max', () => {
    const m = progressModel(11, 8);
    expect(m.now).toBe(8);
    expect(m.segments.every(Boolean)).toBe(true);
    expect(m.label).toBe('8 of 8');
  });
  it('floors fractions and falls back on a bad max', () => {
    expect(progressModel(2.7, 3.9)).toMatchObject({ now: 2, max: 3 });
    expect(progressModel(1, 0).max).toBe(DEFAULT_MAX);
  });
});

describe('newlyFilled', () => {
  it('animates nothing on first render or a decrease', () => {
    expect(newlyFilled(undefined, 5).size).toBe(0);
    expect(newlyFilled(5, 3).size).toBe(0);
    expect(newlyFilled(5, 5).size).toBe(0);
  });
  it('animates the segments that were just filled', () => {
    expect([...newlyFilled(5, 7)]).toEqual([5, 6]);
    expect([...newlyFilled(-1, 1)]).toEqual([0]);
  });
});
