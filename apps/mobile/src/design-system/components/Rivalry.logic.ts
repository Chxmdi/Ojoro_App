/**
 * Pure rules for `Rivalry` (web reference `function Rivalry`;
 * components/Rivalry.md). No React Native imports.
 */

export type RivalryRecord = { a: number; b: number; draws?: number | undefined };
export type RivalryResult = 'a' | 'b' | 'd';

function whole(n: number | undefined): number {
  return n != null && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function cleanRecord(r: RivalryRecord | undefined): { a: number; b: number; draws: number } {
  return { a: whole(r?.a), b: whole(r?.b), draws: whole(r?.draws) };
}

export function meetings(r: RivalryRecord | undefined): number {
  const c = cleanRecord(r);
  return c.a + c.b + c.draws;
}

/** "RIVALRY · 9 MEETINGS", "RIVALRY · 1 MEETING". */
export function rivalryOverline(r: RivalryRecord | undefined): string {
  const n = meetings(r);
  return `RIVALRY · ${n} ${n === 1 ? 'MEETING' : 'MEETINGS'}`;
}

/**
 * The record as a sentence (Rivalry.md): "Rivalry. Chimdi leads Marcus 5 to 3,
 * with 1 draw, after 9 meetings." Level: "Chimdi and Marcus are level at 4
 * each…". None yet: "Chimdi and Marcus haven't met yet."
 */
export function recordSentence(a: string, b: string, r: RivalryRecord | undefined): string {
  const c = cleanRecord(r);
  const n = c.a + c.b + c.draws;
  if (n === 0) return `Rivalry. ${a} and ${b} haven't met yet.`;
  const draws = c.draws ? `, with ${c.draws} ${c.draws === 1 ? 'draw' : 'draws'}` : '';
  const after = `, after ${n} ${n === 1 ? 'meeting' : 'meetings'}.`;
  if (c.a === c.b) return `Rivalry. ${a} and ${b} are level at ${c.a} each${draws}${after}`;
  const [lead, trail, hi, lo] = c.a > c.b ? [a, b, c.a, c.b] : [b, a, c.b, c.a];
  return `Rivalry. ${lead} leads ${trail} ${hi} to ${lo}${draws}${after}`;
}

/** "FORM · LAST 8 (OLDEST FIRST)". */
export function formHeading(count: number): string {
  return `FORM · LAST ${count} (OLDEST FIRST)`;
}

export type FormCell = {
  result: RivalryResult;
  /** The winner's initial, or = for a draw. */
  mark: string;
  /** Screen readers hear the winner's name, or "Draw". */
  label: string;
};

/** Form cells, oldest first. Unknown results are dropped. */
export function formCells(
  history: readonly RivalryResult[] | undefined,
  a: string,
  b: string,
): FormCell[] {
  return (history ?? []).flatMap((w): FormCell[] => {
    if (w === 'd') return [{ result: 'd', mark: '=', label: 'Draw' }];
    if (w !== 'a' && w !== 'b') return [];
    const name = w === 'a' ? a : b;
    return [{ result: w, mark: name.charAt(0).toUpperCase(), label: name }];
  });
}
