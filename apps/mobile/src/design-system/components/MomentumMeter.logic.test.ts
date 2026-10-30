import { describe, expect, it } from 'vitest';

import { MOMENTUM_BAR_MAX, MOMENTUM_BAR_MIN, momentumModel } from './MomentumMeter.logic';

describe('momentumModel', () => {
  it('scales bars to the busiest week, with a floor', () => {
    const m = momentumModel([2, 4, 0, 1], 3);
    expect(m.bars).toEqual([28, MOMENTUM_BAR_MAX, MOMENTUM_BAR_MIN, 14]);
  });

  it('states the streak as a count in words', () => {
    expect(momentumModel([1], 6).streakText).toBe('6 WEEK STREAK');
    expect(momentumModel([1]).streakText).toBe('0 WEEK STREAK');
    expect(momentumModel([1], -2.5).streakText).toBe('0 WEEK STREAK');
  });

  it('reads as one sentence, in sentence case', () => {
    expect(momentumModel([1, 2, 3], 6, 'RHYTHM · 8 WEEKS').accessibilityLabel).toBe(
      'Rhythm · 8 weeks: 3 sessions this week, 3 week history. 6 week streak.',
    );
    expect(momentumModel([2, 1]).accessibilityLabel).toBe(
      'Momentum: 1 session this week, 2 week history. 0 week streak.',
    );
  });

  it('handles no history and bad numbers', () => {
    const m = momentumModel([]);
    expect(m.bars).toEqual([]);
    expect(m.accessibilityLabel).toBe('Momentum: no sessions yet. 0 week streak.');
    expect(momentumModel([Number.NaN, -1, 0]).bars).toEqual([6, 6, 6]);
  });
});
