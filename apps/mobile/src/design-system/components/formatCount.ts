/**
 * The number shown in an IconButton count badge: nothing for zero or less,
 * the count up to 9, then `9+` (web reference: `p.count > 9 ? '9+' : p.count`).
 * Returns null when no badge should show.
 */
export function formatCount(count: number | undefined | null): string | null {
  if (count == null || !Number.isFinite(count)) return null;
  const n = Math.floor(count);
  if (n <= 0) return null;
  return n > 9 ? '9+' : String(n);
}
