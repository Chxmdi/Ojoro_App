import { describe, expect, it } from 'vitest';

import { POSTER_HERO_MAX, POSTER_HERO_MIN, posterHeroSize } from './posterHero';

describe('posterHeroSize', () => {
  it('is 29% of the poster width between the bounds', () => {
    expect(posterHeroSize(300).fontSize).toBeCloseTo(87);
    // 390pt phone, 20pt page gutters, 24pt poster padding: 302pt of content.
    expect(posterHeroSize(302).fontSize).toBeCloseTo(87.58);
  });

  it('never goes below 64', () => {
    expect(POSTER_HERO_MIN).toBe(64);
    expect(posterHeroSize(100).fontSize).toBe(64);
    expect(posterHeroSize(0).fontSize).toBe(64);
  });

  it('never goes above the token size, 120', () => {
    expect(POSTER_HERO_MAX).toBe(120);
    expect(posterHeroSize(1000).fontSize).toBe(120);
  });

  it('keeps the token line height and tracking ratios', () => {
    const { fontSize, lineHeight, letterSpacing } = posterHeroSize(300);
    expect(lineHeight).toBeCloseTo(fontSize * 0.88);
    expect(letterSpacing).toBeCloseTo(fontSize * 0.005);
  });

  it('falls back to the full size for a width that is not a number', () => {
    expect(posterHeroSize(Number.NaN).fontSize).toBe(120);
  });
});
