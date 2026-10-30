import { sentenceCase } from './word';

/** Bars sit in a 56pt row; an empty week still shows a 6pt stub so the week is countable. */
export const MOMENTUM_BAR_MAX = 56;
export const MOMENTUM_BAR_MIN = 6;
export const MOMENTUM_DEFAULT_LABEL = 'MOMENTUM';

export type MomentumModel = {
  label: string;
  /** "6 WEEK STREAK", or the owner's words ("COMEBACK WEEK"); empty when there's no streak. Never a glow, never zero. */
  streakText: string;
  /** Bar heights in pt, oldest first; the last is this week. */
  bars: number[];
  accessibilityLabel: string;
};

function sessions(n: number): string {
  return `${n} session${n === 1 ? '' : 's'}`;
}

/**
 * Port of `function MomentumMeter` (bundle.js): heights scale to the busiest
 * week (`max(6, n / max × 56)`), and the whole meter reads as one sentence:
 * "Rhythm · 8 weeks: 3 sessions this week, 8 week history. 6 week streak."
 */
export function momentumModel(
  weeks: readonly number[],
  streak = 0,
  label: string = MOMENTUM_DEFAULT_LABEL,
  streakText?: string,
): MomentumModel {
  const clean = weeks.map((n) => (Number.isFinite(n) && n > 0 ? n : 0));
  const max = Math.max(1, ...clean);
  const now = clean.length ? clean[clean.length - 1]! : 0;
  // Never a zero streak (PRD §9.12: no shame for absence). The owner may say what the week is
  // instead ("COMEBACK WEEK", "FIRST WEEK"); with no streak and no words, nothing is written.
  const n = Number.isFinite(streak) ? Math.max(0, Math.floor(streak)) : 0;
  const words = streakText?.trim() || (n > 0 ? `${n} WEEK STREAK` : '');
  const history = clean.length
    ? `${sessions(now)} this week, ${clean.length} week history`
    : 'no sessions yet';
  return {
    label,
    streakText: words,
    bars: clean.map((n) => Math.max(MOMENTUM_BAR_MIN, (n / max) * MOMENTUM_BAR_MAX)),
    accessibilityLabel: `${sentenceCase(label)}: ${history}.${words ? ` ${sentenceCase(words)}.` : ''}`,
  };
}
