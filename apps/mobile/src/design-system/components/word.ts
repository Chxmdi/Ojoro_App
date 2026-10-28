/**
 * Port of `word()` from the web reference (bundle.js): counts from zero to
 * twelve as words, for spoken labels ("Seven of eight participants
 * committed."). Anything else is the numeral.
 */
const WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
] as const;

export function word(n: number): string {
  return (Number.isInteger(n) ? WORDS[n] : undefined) ?? String(n);
}

/** Capital first letter, for a word that starts a sentence ("Seven of eight…"). */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
