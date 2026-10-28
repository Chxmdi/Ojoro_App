import { describe, expect, it } from 'vitest';

import { quoteLayout, quoted } from './Quote.logic';

describe('quoted', () => {
  it('wraps in curly quotes once', () => {
    expect(quoted('Saturday. Mount Royal.')).toBe('“Saturday. Mount Royal.”');
    expect(quoted('“Already quoted”')).toBe('“Already quoted”');
    expect(quoted('"Straight"')).toBe('“Straight”');
    expect(quoted('"half')).toBe('“"half”');
    expect(quoted('  ')).toBe('');
  });
});

describe('quoteLayout', () => {
  it('note is the req-note bar, callout the CallOut bar', () => {
    expect(quoteLayout()).toMatchObject({
      barWidth: 2,
      barColor: 'line-strong',
      paddingLeft: 12,
      textVariant: 'body',
    });
    expect(quoteLayout('callout')).toMatchObject({
      barWidth: 4,
      barColor: 'text',
      paddingLeft: 12,
      paddingY: 16,
      textVariant: 'title',
      gap: 6,
    });
  });
});
