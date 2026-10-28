import { describe, expect, it } from 'vitest';

import { gameOnPosterModel, shouldCelebrate } from './GameOnPoster.logic';

describe('gameOnPosterModel', () => {
  const base = { activity: 'Football', time: 'Tonight 7:30', place: 'Jeanne-Mance Park' };

  it('matches the web copy', () => {
    const m = gameOnPosterModel({ ...base, count: 8 });
    expect(m.overline).toBe('CONFIRMED · 8 IN');
    expect(m.hero).toEqual(['GAME', 'ON']);
    expect(m.meta).toEqual([
      { label: 'WHAT', value: 'Football' },
      { label: 'WHEN', value: 'Tonight 7:30' },
      { label: 'WHERE', value: 'Jeanne-Mance Park' },
    ]);
    expect(m.accessibilityLabel).toBe('Game on. Football, Tonight 7:30, Jeanne-Mance Park.');
  });

  it('drops the count clause when there is no count', () => {
    expect(gameOnPosterModel(base).overline).toBe('CONFIRMED');
    expect(gameOnPosterModel({ ...base, count: 0 }).overline).toBe('CONFIRMED');
    expect(gameOnPosterModel({ ...base, count: Number.NaN }).overline).toBe('CONFIRMED');
  });
});

describe('shouldCelebrate', () => {
  it('plays on first render with celebrate', () => {
    expect(shouldCelebrate(undefined, true)).toBe(true);
  });
  it('plays when celebrate turns on', () => {
    expect(shouldCelebrate(false, true)).toBe(true);
  });
  it('does not replay while it stays on, or when off', () => {
    expect(shouldCelebrate(true, true)).toBe(false);
    expect(shouldCelebrate(undefined, false)).toBe(false);
    expect(shouldCelebrate(true, false)).toBe(false);
  });
});
