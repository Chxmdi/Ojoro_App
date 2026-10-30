export const DEFAULT_LAST_LABEL = 'LAST WEEK';
export const DEFAULT_X_EVERY = 3;

/**
 * Gridlines: 0 and three even steps to a round top that clears the biggest
 * value (58 → 0, 20, 40, 60). Steps are whole numbers for counts.
 */
export function chartTicks(values: readonly number[]): number[] {
  const max = Math.max(0, ...values.filter(Number.isFinite));
  const raw = max / 3;
  if (raw <= 1) return [0, 1, 2, 3];
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw && Number.isInteger(s)) ?? 10 * mag;
  return [0, step, step * 2, step * 3];
}

/** Column height in pt against the top tick. */
export function columnHeight(value: number, top: number, height: number): number {
  if (!(top > 0) || !Number.isFinite(value)) return 0;
  return Math.round((Math.min(Math.max(0, value), top) / top) * height);
}

/** Axis label under the column: given, else the label in caps on every nth. */
export function axisLabel(
  d: { label: string; axisLabel?: string | undefined },
  i: number,
  every: number = DEFAULT_X_EVERY,
): string {
  if (d.axisLabel !== undefined) return d.axisLabel;
  return i % Math.max(1, Math.floor(every)) === 0 ? d.label.toUpperCase() : '';
}

export function columnLabel(
  d: { label: string; value: number; accessibilityLabel?: string | undefined },
  unit: string,
): string {
  return d.accessibilityLabel ?? `${d.label}: ${d.value} ${unit}`;
}

export function readout(
  d: { label: string; value: number; meta?: string | undefined },
  unit: string,
): { value: string; meta: string } {
  return { value: `${d.value} ${unit}`, meta: d.meta ?? d.label };
}

export function endLabel(value: number, lastLabel: string = DEFAULT_LAST_LABEL): string {
  return `${lastLabel} · ${value}`;
}

export function toggleLabel(view: 'chart' | 'table'): string {
  return view === 'chart' ? 'SHOW AS TABLE' : 'SHOW AS CHART';
}

/** Space between the end label and the column under it. */
export const END_LABEL_GAP = 6;

/**
 * Bottom offset (pt above the baseline) for the end label. The label is
 * right-aligned to the last bar and runs left across neighbouring columns,
 * so it sits above the tallest column it spans, never on top of one.
 * Until the label is measured (`labelWidth` 0) it clears every column.
 */
export function endLabelBottom(
  heights: readonly number[],
  colWidth: number,
  barWidth: number,
  labelWidth: number,
): number {
  if (heights.length === 0) return END_LABEL_GAP;
  const inset = Math.max(0, (colWidth - barWidth) / 2);
  const spanned =
    labelWidth > 0 && colWidth > 0
      ? Math.min(heights.length, Math.max(1, Math.ceil((labelWidth + inset) / colWidth)))
      : heights.length;
  return Math.max(...heights.slice(-spanned)) + END_LABEL_GAP;
}
