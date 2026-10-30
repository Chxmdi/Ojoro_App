/** One tile read as a sentence: "91%, showed up. +3 pts on the 30 days before." */
export function statTileLabel(value: string, label: string, delta?: string): string {
  const head = `${value}, ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
  return delta ? `${head}. ${delta}.` : `${head}.`;
}

/** Split tiles into rows of `columns` (the web grid's `repeat(2, 1fr)`). */
export function tileRows<T>(items: readonly T[], columns: number): T[][] {
  const n = Math.max(1, Math.floor(columns));
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += n) rows.push(items.slice(i, i + n));
  return rows;
}
