export type MeterModel = { pct: number; now: number; max: number };

/** Clamp to 0..max (max defaults to 100) and give the fill as a percentage. */
export function meterModel(value: number, max = 100): MeterModel {
  const m = Number.isFinite(max) && max > 0 ? max : 100;
  const now = Number.isFinite(value) ? Math.min(m, Math.max(0, value)) : 0;
  return { pct: (now / m) * 100, now, max: m };
}
