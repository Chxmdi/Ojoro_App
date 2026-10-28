import { describe, expect, it } from 'vitest';

import { STRIP_LEADING_WIDTH, stripAccessibilityLabel, stripLayout, textOf } from './Strip.logic';

describe('stripLayout', () => {
  it('matches .oj-strip with a leading column: 12 padding, 16 gap, 72 column', () => {
    expect(stripLayout({ hasLeading: true })).toEqual({ paddingY: 12, gap: 16, bodyGap: 0 });
    expect(STRIP_LEADING_WIDTH).toBe(72);
  });

  it('tightens the gap to 12 without a leading column', () => {
    expect(stripLayout({ hasLeading: false, titleVariant: 'title-sm' })).toEqual({
      paddingY: 12,
      gap: 12,
      bodyGap: 0,
    });
  });

  it('opens up for display titles', () => {
    expect(stripLayout({ hasLeading: false, titleVariant: 'display-sm' })).toEqual({
      paddingY: 16,
      gap: 12,
      bodyGap: 4,
    });
    expect(stripLayout({ hasLeading: false, titleVariant: 'display-xs' })).toEqual({
      paddingY: 14,
      gap: 12,
      bodyGap: 0,
    });
  });
});

describe('textOf', () => {
  it('reads strings and numbers', () => {
    expect(textOf('3 DAYS')).toBe('3 DAYS');
    expect(textOf(6)).toBe('6');
  });

  it('reads through elements and arrays', () => {
    const badge = { type: 'Badge', props: { children: ['6', ' / ', 8] } };
    expect(textOf(badge)).toBe('6  /  8');
    expect(textOf({ props: { children: { props: { children: 'GAME ON' } } } })).toBe('GAME ON');
  });

  it('is empty for nothing, booleans, functions and childless elements', () => {
    expect(textOf(null)).toBe('');
    expect(textOf(undefined)).toBe('');
    expect(textOf(false)).toBe('');
    expect(textOf(() => 'x')).toBe('');
    expect(textOf({ props: {} })).toBe('');
    expect(textOf({})).toBe('');
  });
});

describe('stripAccessibilityLabel', () => {
  it('reads the row in visual order with commas', () => {
    expect(
      stripAccessibilityLabel([
        'SAT',
        'Chimdi vs Marcus · 5K',
        '142 following · build-up',
        '3 DAYS',
      ]),
    ).toBe('SAT, Chimdi vs Marcus · 5K, 142 following · build-up, 3 DAYS');
  });

  it('skips missing and blank parts', () => {
    expect(stripAccessibilityLabel([undefined, 'Series settings', null, ' ', 'Approval'])).toBe(
      'Series settings, Approval',
    );
  });
});
