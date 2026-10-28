import { describe, expect, it } from 'vitest';

import { focusRingStyle, isFocusVisible } from './focusRing';

describe('focusRingStyle', () => {
  it('is a 2px ring with a 2px offset', () => {
    expect(focusRingStyle('#290000')).toEqual({
      outlineWidth: 2,
      outlineStyle: 'solid',
      outlineColor: '#290000',
      outlineOffset: 2,
    });
  });
});

describe('isFocusVisible', () => {
  it('always shows on native', () => {
    expect(isFocusVisible(null, false)).toBe(true);
  });
  it('asks the browser on web', () => {
    expect(isFocusVisible({ matches: () => false }, true)).toBe(false);
    expect(isFocusVisible({ matches: (s: string) => s === ':focus-visible' }, true)).toBe(true);
  });
  it('falls back to showing when the browser cannot say', () => {
    expect(isFocusVisible(undefined, true)).toBe(true);
    expect(isFocusVisible({}, true)).toBe(true);
    expect(
      isFocusVisible(
        {
          matches: () => {
            throw new Error('unsupported');
          },
        },
        true,
      ),
    ).toBe(true);
  });
});
