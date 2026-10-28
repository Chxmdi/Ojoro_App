/**
 * Port of `initials()` from the web reference (bundle.js): the first letter of
 * each word, at most two, uppercased. A missing name reads "?".
 *
 * One deliberate difference: letters are taken by code point (`Array.from`),
 * so a name that starts with an astral character keeps the whole character
 * instead of half a surrogate pair. For every BMP name the result is identical.
 */
export function initials(name?: string | null): string {
  const words = String(name || '?').split(/\s+/);
  const firsts = words.map((word) => Array.from(word)[0] ?? '');
  return Array.from(firsts.join('')).slice(0, 2).join('').toUpperCase();
}
