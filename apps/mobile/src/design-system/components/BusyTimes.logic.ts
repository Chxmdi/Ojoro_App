/**
 * Pure logic for BusyTimes (Place "When it's busy"): relative bar heights,
 * the words a screen reader hears for each bar, and the sentence under the
 * chart, so the highlighted bar never rests on colour.
 */

export type BusyTimesDatum = {
  key?: string | undefined;
  /** Axis word: MON. */
  label: string;
  /** Full name for sentences: Monday. */
  name: string;
  /** Any relative measure (games in the last weeks). Only the shape is shown. */
  value: number;
};

export type BusyLevel = 'busiest' | 'busy' | 'steady' | 'quiet' | 'nothing on';

const ORDINALS = ['', '', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh'];

function clean(v: number): number {
  return Number.isFinite(v) && v > 0 ? v : 0;
}

export function busyMax(data: readonly BusyTimesDatum[]): number {
  return Math.max(0, ...data.map((d) => clean(d.value)));
}

/** Bar height as a share of the busiest (0–1). A non-zero bar is never thinner than `minShare`. */
export function barShare(value: number, max: number, minShare = 0.06): number {
  const v = clean(value);
  if (!(max > 0) || v === 0) return 0;
  return Math.max(minShare, Math.min(1, v / max));
}

export function busyLevel(value: number, max: number): BusyLevel {
  const v = clean(value);
  if (!(max > 0) || v === 0) return 'nothing on';
  if (v >= max) return 'busiest';
  const s = v / max;
  if (s >= 0.66) return 'busy';
  if (s >= 0.33) return 'steady';
  return 'quiet';
}

/** 1 for the busiest; ties share a rank. */
export function busyRank(data: readonly BusyTimesDatum[], index: number): number {
  const v = clean(data[index]?.value ?? 0);
  return 1 + new Set(data.map((d) => clean(d.value)).filter((x) => x > v)).size;
}

function ordinal(n: number): string {
  return ORDINALS[n] ?? `${n}th`;
}

function sentence(word: string): string {
  const w = word.trim().toLowerCase();
  return w ? w[0]!.toUpperCase() + w.slice(1) : w;
}

/**
 * "Busiest Thursday evenings. Tonight (Tuesday) is the second busiest."
 * `period` is plural ("evenings"); `currentWord` names the current bar (TONIGHT).
 */
export function busySummary(
  data: readonly BusyTimesDatum[],
  {
    currentIndex,
    currentWord = 'TONIGHT',
    period,
  }: {
    currentIndex?: number | null | undefined;
    currentWord?: string;
    period?: string | undefined;
  } = {},
): string {
  const max = busyMax(data);
  if (max === 0) return 'Not enough games here yet to show when it gets busy.';
  const top = data.filter((d) => clean(d.value) === max).map((d) => d.name);
  const when = period ? ` ${period}` : '';
  const head = `Busiest ${joinNames(top)}${when}.`;
  if (currentIndex == null || !data[currentIndex]) return head;
  const now = `${sentence(currentWord)} (${data[currentIndex].name})`;
  const rank = busyRank(data, currentIndex);
  const value = clean(data[currentIndex].value);
  if (value === 0) return `${head} ${now} is usually quiet.`;
  return rank === 1
    ? `${head} ${now} is ${top.length > 1 ? 'one of the busiest' : 'the busiest'}.`
    : `${head} ${now} is the ${ordinal(rank)} busiest.`;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The chart's spoken description: "When it's busy, evenings. Monday quiet. Tuesday busy, tonight. …" */
export function busyLabel(
  title: string,
  data: readonly BusyTimesDatum[],
  {
    currentIndex,
    currentWord = 'TONIGHT',
  }: { currentIndex?: number | null | undefined; currentWord?: string } = {},
): string {
  const max = busyMax(data);
  const bars = data.map(
    (d, i) =>
      `${d.name} ${busyLevel(d.value, max)}${i === currentIndex ? `, ${currentWord.toLowerCase()}` : ''}.`,
  );
  return `${title.trim().replace(/\.$/, '')}. ${bars.join(' ')}`;
}
