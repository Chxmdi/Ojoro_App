import { describe, expect, it } from 'vitest';
import { colors } from './index.js';

describe('Ojoro design tokens', () => {
  it('uses the approved six-color brand palette', () => {
    expect(colors.black).toBe('#000000');
    expect(colors.ink).toBe('#141515');
    expect(colors.maroon).toBe('#290000');
    expect(colors.charcoal).toBe('#45484A');
    expect(colors.taupe).toBe('#A7A08B');
    expect(colors.white).toBe('#FFFFFF');
  });
});
