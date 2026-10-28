import { describe, expect, it } from 'vitest';

import { ERROR_PREFIX, MULTILINE_MIN_HEIGHT, inputMessage, inputPadding, inputRule } from './Input.logic';

describe('inputMessage', () => {
  it('is null with neither hint nor error', () => {
    expect(inputMessage()).toBeNull();
    expect(inputMessage('', '')).toBeNull();
  });
  it('shows the hint as spoken', () => {
    expect(inputMessage('People see the exact pitch once they are in.')).toEqual({
      kind: 'hint',
      text: 'People see the exact pitch once they are in.',
      spoken: 'People see the exact pitch once they are in.',
    });
  });
  it('lets the error win and prefixes it in words', () => {
    expect(inputMessage('A hint', 'Pick a time after now.')).toEqual({
      kind: 'error',
      text: 'Pick a time after now.',
      spoken: `${ERROR_PREFIX}Pick a time after now.`,
    });
    expect(ERROR_PREFIX).toBe('Error: ');
  });
});

describe('inputRule', () => {
  it('is a 2px line-strong rule at rest', () => {
    expect(inputRule({ focused: false, error: false })).toEqual({ width: 2, color: 'line-strong' });
  });
  it('turns signal on focus', () => {
    expect(inputRule({ focused: true, error: false })).toEqual({ width: 2, color: 'signal' });
  });
  it('is a heavier text rule on error, focused or not, never a status colour', () => {
    expect(inputRule({ focused: false, error: true })).toEqual({ width: 4, color: 'text' });
    expect(inputRule({ focused: true, error: true })).toEqual({ width: 4, color: 'text' });
  });
});

describe('inputPadding', () => {
  it('leaves room for the icon', () => {
    expect(inputPadding(true)).toEqual({ paddingLeft: 44, paddingRight: 12 });
    expect(inputPadding(false)).toEqual({ paddingLeft: 12, paddingRight: 12 });
  });
  it('makes multiline wells three rows tall', () => {
    expect(MULTILINE_MIN_HEIGHT).toBe(96);
  });
});
