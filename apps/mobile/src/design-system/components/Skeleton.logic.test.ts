import { describe, expect, it } from 'vitest';

import {
  loadingProps,
  SKELETON_DELAY,
  SKELETON_KINDS,
  skeletonPulse,
  skeletonWait,
  textLineWidths,
} from './Skeleton.logic';

describe('skeletonWait', () => {
  it('waits 300ms from the start of the load by default', () => {
    expect(SKELETON_DELAY).toBe(300);
    expect(skeletonWait(1000, 1000)).toBe(300);
    expect(skeletonWait(1000, 1200)).toBe(100);
  });

  it('is 0 once the delay has passed, never negative', () => {
    expect(skeletonWait(1000, 1300)).toBe(0);
    expect(skeletonWait(1000, 5000)).toBe(0);
  });

  it('counts from when the load started, not from mount', () => {
    // A row that mounts 250ms into a load waits only the remaining 50ms.
    expect(skeletonWait(0, 250)).toBe(50);
  });

  it('takes a custom delay; 0 shows at once; bad delays fall back to 300', () => {
    expect(skeletonWait(0, 0, 1000)).toBe(1000);
    expect(skeletonWait(0, 0, 0)).toBe(0);
    expect(skeletonWait(0, 0, -50)).toBe(0);
    expect(skeletonWait(0, 0, Number.NaN)).toBe(300);
  });
});

describe('textLineWidths', () => {
  it('is full width except the last line at 60%, 3 lines by default', () => {
    expect(textLineWidths()).toEqual(['100%', '100%', '60%']);
    expect(textLineWidths(2)).toEqual(['100%', '60%']);
  });

  it('always draws at least one line', () => {
    expect(textLineWidths(1)).toEqual(['60%']);
    expect(textLineWidths(0)).toEqual(['60%']);
    expect(textLineWidths(-4)).toEqual(['60%']);
    expect(textLineWidths(2.7)).toEqual(['100%', '60%']);
    expect(textLineWidths(Number.NaN)).toHaveLength(3);
  });
});

describe('skeletonPulse', () => {
  it('breathes 1 → 0.55 over dur-live', () => {
    expect(skeletonPulse(false, 1600)).toEqual({ from: 1, to: 0.55, halfCycle: 800 });
  });

  it('is static under reduced motion', () => {
    expect(skeletonPulse(true, 1600)).toBeNull();
  });
});

describe('loadingProps', () => {
  it('labels the loading container and marks it busy', () => {
    expect(loadingProps('Loading plans')).toEqual({
      accessible: true,
      accessibilityLabel: 'Loading plans',
      accessibilityState: { busy: true },
      'aria-busy': true,
      accessibilityLiveRegion: 'polite',
    });
  });

  it('lists the three web kinds', () => {
    expect(SKELETON_KINDS).toEqual(['strip', 'object', 'text']);
  });
});
