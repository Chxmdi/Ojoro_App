/**
 * Pure rules for `PredictionBar` (web reference `function PredictionBar`;
 * components/PredictionBar.md). No React Native imports. Predictions are
 * social only: no money, points, odds or payouts, anywhere.
 */
import { sentenceCase } from './word';

export type PredictionSide = { name: string; pct: number };
export type PredictionPick = 'a' | 'b';

export const PREDICTION_QUESTION = 'WHO TAKES IT?';

export type PredictionSplit = {
  /** Whole percentages that always sum to 100 (or both 0 when nobody has picked). */
  a: number;
  b: number;
  /** Nobody has picked yet. */
  empty: boolean;
};

function share(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * The split as shown. Side a is rounded and b takes the rest, so the two
 * always sum to 100 (web: `ap = round(a / total * 100), bp = 100 - ap`).
 * Takes shares or raw counts: they're normalised against their total.
 */
export function predictionSplit(a: PredictionSide, b: PredictionSide): PredictionSplit {
  const pa = share(a.pct);
  const pb = share(b.pct);
  const total = pa + pb;
  if (total === 0) return { a: 0, b: 0, empty: true };
  const ap = Math.round((pa / total) * 100);
  return { a: ap, b: 100 - ap, empty: false };
}

/**
 * The one label (PredictionBar.md): "Who takes it? Chimdi 48 percent, Marcus
 * 52 percent". Your pick and a lock follow as sentences.
 */
export function predictionLabel(p: {
  question?: string | undefined;
  a: PredictionSide;
  b: PredictionSide;
  picked?: PredictionPick | undefined;
  locked?: boolean | undefined;
}): string {
  const q = sentenceCase(p.question ?? PREDICTION_QUESTION);
  const split = predictionSplit(p.a, p.b);
  const body = split.empty
    ? 'No predictions yet'
    : `${p.a.name} ${split.a} percent, ${p.b.name} ${split.b} percent`;
  const pick = p.picked ? `. Your pick, ${p.picked === 'a' ? p.a.name : p.b.name}` : '';
  const lock = p.locked ? '. Predictions locked' : '';
  return `${q} ${body}${pick}${lock}`;
}

/** A side as a choice: "Chimdi, 48 percent" (selected state carries "your pick"). */
export function pickLabel(side: PredictionSide, pct: number, empty: boolean): string {
  return empty ? side.name : `${side.name}, ${pct} percent`;
}
