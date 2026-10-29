/**
 * Pure rules for `LiveIndicator` (`function LiveIndicator` and `.oj-live` in
 * the web reference; components/LiveIndicator.md). No React Native imports.
 */

/** The word on the pill when no label is given. */
export const LIVE_WORD = 'LIVE';

/** `@keyframes oj-pulse`: the dot dims to this opacity halfway through each dur-live cycle. */
export const LIVE_PULSE_LOW = 0.35;

/** The word shown on the pill, always in caps ("LIVE", "SPARRING"). */
export function liveWord(label: string | undefined): string {
  const text = label?.trim();
  return (text ? text : LIVE_WORD).toUpperCase();
}

/**
 * The word read aloud, in sentence case so screen readers don't spell the
 * caps: "Live", "Sparring". The word is the indicator, not the dot.
 */
export function liveLabel(label: string | undefined): string {
  const text = liveWord(label).toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Live counters (the running clock) dim less than the dot, so the figures stay
 * readable at the bottom of the pulse. Not in the web reference, which has no
 * counter pulse; the README's Live family asks for one.
 */
export const LIVE_COUNTER_LOW = 0.6;
