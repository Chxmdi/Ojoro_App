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
