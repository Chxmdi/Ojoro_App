import { describe, expect, it } from 'vitest';

import { capitalize, word } from './word';

describe('word', () => {
  it('spells zero to twelve', () => {
    expect(word(0)).toBe('zero');
    expect(word(1)).toBe('one');
    expect(word(7)).toBe('seven');
    expect(word(12)).toBe('twelve');
  });

  it('falls back to the numeral like the web reference', () => {
    expect(word(13)).toBe('13');
    expect(word(40)).toBe('40');
    expect(word(-1)).toBe('-1');
    expect(word(2.5)).toBe('2.5');
  });
});

describe('capitalize', () => {
  it('uppercases the first letter only', () => {
    expect(capitalize('seven of eight')).toBe('Seven of eight');
    expect(capitalize('12 of 14')).toBe('12 of 14');
    expect(capitalize('')).toBe('');
  });
});
