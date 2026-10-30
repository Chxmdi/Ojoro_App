export type TableColumnSpec = {
  key: string;
  title: string;
  accessibilityLabel?: string | undefined;
  align?: 'left' | 'right' | undefined;
  width?: number | undefined;
};

/** A column without a fixed width takes the rest, but never less than this. */
export const FLEX_COLUMN_MIN = 140;

/** The column whose cell names the row: the given key, else the first left-aligned one, else the first. */
export function rowHeaderKey(
  columns: readonly TableColumnSpec[],
  key?: string,
): string | undefined {
  if (key && columns.some((c) => c.key === key)) return key;
  return (columns.find((c) => c.align === 'left') ?? columns[0])?.key;
}

/** Narrowest the table can be before it scrolls sideways. */
export function tableMinWidth(columns: readonly TableColumnSpec[]): number {
  return columns.reduce((w, c) => w + (c.width ?? FLEX_COLUMN_MIN), 0);
}

export function columnName(c: TableColumnSpec): string {
  if (c.accessibilityLabel) return c.accessibilityLabel;
  const t = c.title.toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * A row read as one sentence on iOS and Android, where RN has no table
 * semantics: the row header first, then each cell after its column's name.
 * "Mile End Strikers. Position 1, Played 2, Points 6. Moved."
 */
export function rowLabel(
  columns: readonly TableColumnSpec[],
  cells: Record<string, string | number>,
  headerKey: string | undefined,
  highlight?: string,
): string {
  const head = headerKey !== undefined ? cells[headerKey] : undefined;
  const rest = columns
    .filter((c) => c.key !== headerKey && cells[c.key] !== undefined && cells[c.key] !== '')
    .map((c) => `${columnName(c)} ${String(cells[c.key])}`);
  const parts = [head !== undefined ? String(head) : undefined, rest.join(', '), highlight];
  return `${parts.filter(Boolean).join('. ')}.`;
}
