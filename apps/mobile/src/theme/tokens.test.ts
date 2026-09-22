import { describe, expect, it } from 'vitest';

import { colors } from './tokens';

describe('Ojoro design tokens', () => {
  it('preserves the approved primary palette', () => {
    expect(colors).toEqual({
      black: '#000000',
      ink: '#141515',
      maroon: '#290000',
      charcoal: '#45484A',
      taupe: '#A7A08B',
      white: '#FFFFFF',
    });
  });
});
