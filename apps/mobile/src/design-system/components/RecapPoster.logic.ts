/**
 * Pure rules for `RecapPoster` (web reference `function RecapPoster`;
 * components/RecapPoster.md). No React Native imports.
 */

export type RecapStat = { value: string; label: string };

export type RecapModel = {
  /** "RECAP · SAT 12 OCT", or RECAP alone. */
  overline: string;
  /** A fact with a period: "CHIMDI WINS.". */
  headline: string;
  /** "Recap, SAT 12 OCT. Result verified. Chimdi wins. 5K. 22:48 Chimdi, 23:31 Marcus. Out hard…" */
  accessibilityLabel: string;
};

export function recapModel(p: {
  winner: string;
  discipline: string;
  date?: string | undefined;
  result?: string | undefined;
  story?: string | undefined;
  stats?: readonly RecapStat[] | undefined;
}): RecapModel {
  const stats = (p.stats ?? []).map((s) => `${s.value} ${s.label}`).join(', ');
  const parts = [
    p.date ? `Recap, ${p.date}` : 'Recap',
    'Result verified',
    `${p.winner} wins`,
    p.discipline,
    p.result,
    stats,
    p.story?.replace(/[.\s]+$/, ''),
  ].filter(Boolean);
  return {
    overline: p.date ? `RECAP · ${p.date}`.toUpperCase() : 'RECAP',
    headline: `${p.winner.toUpperCase()} WINS.`,
    accessibilityLabel: `${parts.join('. ')}.`,
  };
}
