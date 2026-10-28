/**
 * Pure rules for `Quote`, the quote block (`.req-note` in HostRequests and
 * the blockquote in CallOut; DESIGN_SYSTEM_PORT §8). No React Native imports.
 */

export const QUOTE_VARIANTS = ['note', 'callout'] as const;
export type QuoteVariant = (typeof QUOTE_VARIANTS)[number];

const OPEN = '“';
const CLOSE = '”';

/** Wraps the words in curly quotes, unless they already carry quotes (straight or curly). */
export function quoted(text: string): string {
  const t = text.trim();
  if (!t) return '';
  const opens = t.startsWith(OPEN) || t.startsWith('"');
  const closes = t.endsWith(CLOSE) || (t.length > 1 && t.endsWith('"'));
  if (opens && closes) return OPEN + t.slice(1, -1) + CLOSE;
  return OPEN + t + CLOSE;
}

export type QuoteLayout = {
  /** The bar's width, pt (`.req-note` 2px `line-strong`; CallOut 4px `text`). */
  barWidth: number;
  barColor: 'line-strong' | 'text';
  /** Gap between bar and words, pt (the words start at barWidth + paddingLeft). */
  paddingLeft: number;
  paddingY: number;
  textVariant: 'body' | 'title';
  /** Gap between the words and the attribution, pt. */
  gap: number;
};

export function quoteLayout(variant: QuoteVariant = 'note'): QuoteLayout {
  return variant === 'callout'
    ? // CallOut draws its bar as `box-shadow: inset 4px 0 0` inside 16px of padding,
      // so the words sit 16 from the edge: 4 of bar plus 12.
      { barWidth: 4, barColor: 'text', paddingLeft: 12, paddingY: 16, textVariant: 'title', gap: 6 }
    : {
        barWidth: 2,
        barColor: 'line-strong',
        paddingLeft: 12,
        paddingY: 0,
        textVariant: 'body',
        gap: 4,
      };
}
