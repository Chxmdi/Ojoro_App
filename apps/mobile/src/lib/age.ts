/**
 * How old the last known state is, for offline and stale banners ("Showing the last count from
 * 7:02."). Times are local, 12-hour, without seconds, matching the designs.
 */
export function clockTime(at: Date): string {
  const hours = at.getHours();
  const minutes = at.getMinutes().toString().padStart(2, '0');
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${minutes}`;
}

export function clockTimeWithPeriod(at: Date): string {
  return `${clockTime(at)} ${at.getHours() < 12 ? 'AM' : 'PM'}`;
}

/** A query's `dataUpdatedAt` (ms) as a Date, or null when nothing has loaded yet. */
export function updatedAt(dataUpdatedAt: number): Date | null {
  return dataUpdatedAt > 0 ? new Date(dataUpdatedAt) : null;
}
