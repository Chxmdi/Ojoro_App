import { describe, expect, it } from 'vitest';

import { initials } from './initials';

describe('initials', () => {
  it('takes the first letter of the first two words', () => {
    expect(initials('Maya K')).toBe('MK');
    expect(initials('Chimdi Okafor Bello')).toBe('CO');
  });

  it('uppercases', () => {
    expect(initials('lena r')).toBe('LR');
  });

  it('keeps a single word to one letter', () => {
    expect(initials('Theo')).toBe('T');
  });

  it('reads "?" without a name', () => {
    expect(initials()).toBe('?');
    expect(initials('')).toBe('?');
    expect(initials(null)).toBe('?');
  });

  it('ignores surrounding and repeated whitespace like the web reference', () => {
    expect(initials('  Ade   B ')).toBe('AB');
  });

  it('keeps astral characters whole', () => {
    expect(initials('\u{1D4D0}da Lovelace')).toBe('\u{1D4D0}L');
  });
});
