/**
 * Pure rules for `DownFor` (web reference `function DownFor`;
 * components/DownFor.md). No React Native imports, so it runs in Node.
 */

export type DownForModelInput = {
  activity: string;
  when: string;
  downCount: number;
};

export type DownForModel = {
  /** The editorial question: "FOOTBALL TONIGHT?". */
  question: string;
  /** Display size that keeps the question's longest word on one line at phone width. */
  questionSize: DisplayFitSize;
  /** The caption next to the cluster: "11 down". */
  countText: string;
  /** The count, never negative or fractional. */
  count: number;
  /** The spec sentence: "Football tonight. 11 people down." */
  accessibilityLabel: string;
};

function wholeCount(n: number | undefined): number {
  return n && n > 0 && Number.isFinite(n) ? Math.floor(n) : 0;
}

export function downForModel({ activity, when, downCount }: DownForModelInput): DownForModel {
  const count = wholeCount(downCount);
  return {
    question: `${activity} ${when}?`.toUpperCase(),
    questionSize: fitDisplaySize(`${activity} ${when}?`),
    countText: `${count} down`,
    count,
    accessibilityLabel: downForAccessibilityLabel(activity, when, count),
  };
}

/**
 * The web's `aria-label` ("Football tonight. 11 people down."). One deliberate
 * difference, as in AvatarCluster: a single person reads "1 person down."
 */
export function downForAccessibilityLabel(activity: string, when: string, count: number): string {
  return `${activity} ${when}. ${count} ${count === 1 ? 'person' : 'people'} down.`;
}

export type DisplayFitSize = 'xl' | 'lg' | 'md';

/**
 * Display words never break mid-word. At phone width (350pt of copy) display-xl (88px Anton)
 * holds about 8 capitals ("FOOTBALL"), display-lg about 11 ("VOLLEYBALL?"), display-md about 15.
 * Picks the largest size whose limit the longest word fits.
 */
export function fitDisplaySize(text: string): DisplayFitSize {
  const longest = Math.max(0, ...text.split(/\s+/).map((word) => word.length));
  if (longest <= 8) return 'xl';
  if (longest <= 11) return 'lg';
  return 'md';
}
