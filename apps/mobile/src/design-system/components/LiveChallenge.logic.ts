/**
 * Pure rules for `LiveChallenge` (web reference `function LiveChallenge`;
 * components/LiveChallenge.md). No React Native imports.
 */

export type LiveCompetitor = { name: string; value: number; checkedIn?: boolean | undefined };

/** Updates are announced at most this often (LiveChallenge.md: every 30s). */
export const LIVE_ANNOUNCE_MS = 30_000;

function num(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** A value as shown: up to two decimals, no trailing zeros ("3.4", "5", "0.25"). */
export function formatValue(n: number): string {
  return String(Math.round(num(n) * 100) / 100);
}

/** How full a lane is, 0–100, whole (web: `min(100, round(value / target * 100))`). */
export function lanePct(value: number, target: number): number {
  const t = num(target) || 1;
  return Math.min(100, Math.round((num(value) / t) * 100));
}

/** "Chimdi 3.4 KM of 5, checked in" (LiveChallenge.md). */
export function laneLabel(c: LiveCompetitor, unit: string, target: number): string {
  return `${c.name} ${formatValue(c.value)} ${unit} of ${formatValue(target)}${c.checkedIn ? ', checked in' : ''}`;
}

/** The top line: "5K · TARGET 5 KM". */
export function targetLine(discipline: string, target: number, unit: string): string {
  return `${discipline} · TARGET ${formatValue(target)} ${unit}`.toUpperCase();
}

/** "212 watching", or null for none. */
export function watchingLine(watching: number | undefined): string | null {
  const n = watching != null && Number.isFinite(watching) ? Math.floor(watching) : 0;
  return n > 0 ? `${n} watching` : null;
}

/**
 * The race in words, told by numbers, never by colour: "Chimdi 3.4 KM,
 * Marcus 3.1 KM. Chimdi leads by 0.3 KM." or "… Level."
 */
export function raceSummary(a: LiveCompetitor, b: LiveCompetitor, unit: string): string {
  const va = num(a.value);
  const vb = num(b.value);
  const both = `${a.name} ${formatValue(va)} ${unit}, ${b.name} ${formatValue(vb)} ${unit}.`;
  const gap = Math.round(Math.abs(va - vb) * 100) / 100;
  if (gap === 0) return `${both} Level.`;
  return `${both} ${va > vb ? a.name : b.name} leads by ${formatValue(gap)} ${unit}.`;
}

/** Announce now? Never more than once per `LIVE_ANNOUNCE_MS`; the first change always can. */
export function shouldAnnounce(
  lastAt: number | null,
  now: number,
  every = LIVE_ANNOUNCE_MS,
): boolean {
  return lastAt === null || now - lastAt >= every;
}
