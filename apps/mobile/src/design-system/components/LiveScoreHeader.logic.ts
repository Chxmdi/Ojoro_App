/**
 * Pure rules for `LiveScoreHeader` and `LiveClock` (LiveActivity: running
 * clock, score logged by the host, freshness line "Updated 20 s ago").
 * No React Native imports. Times are epoch milliseconds.
 */

/** A score older than this reads as possibly behind (two minutes). */
export const STALE_AFTER_MS = 120_000;

/** Under this, "Updated just now". */
const JUST_NOW_MS = 5_000;

export type ScoreSide = { name: string; score: number };

/** Whole, non-negative milliseconds between two times. */
function since(from: number, now: number): number {
  return Number.isFinite(from) && Number.isFinite(now) ? Math.max(0, now - from) : 0;
}

/** The running clock, in tabular figures: "0:45", "34:12", "1:04:09". */
export function formatClock(elapsedMs: number): string {
  const total = Math.floor(Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** The clock read aloud: "34 minutes, 12 seconds played". */
export function clockLabel(elapsedMs: number): string {
  const total = Math.floor(Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const unit = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
  const parts = [h ? unit(h, 'hour') : null, h || m ? unit(m, 'minute') : null, unit(s, 'second')];
  return `${parts.filter(Boolean).join(', ')} played`;
}

/** How old, shown and spoken: "20 s" / "20 seconds", "3 min" / "3 minutes", "1 h" / "1 hour". */
export function age(ms: number): { shown: string; spoken: string } {
  const s = Math.floor(ms / 1000);
  if (s < 60) return { shown: `${s} s`, spoken: `${s} second${s === 1 ? '' : 's'}` };
  const m = Math.floor(s / 60);
  if (m < 60) return { shown: `${m} min`, spoken: `${m} minute${m === 1 ? '' : 's'}` };
  const h = Math.floor(m / 60);
  return { shown: `${h} h`, spoken: `${h} hour${h === 1 ? '' : 's'}` };
}

export type Freshness = {
  /** The caption: "Updated 20 s ago · logged by Ade (host)". */
  text: string;
  /** The same in words for screen readers. */
  spoken: string;
  /** Old enough that the score may be behind. */
  stale: boolean;
};

/**
 * The freshness line under the score. Live: "Updated 20 s ago". Stale (2 min
 * or more): "Updated 3 min ago. Score may be behind." Offline: the last-known
 * score and how old it is, "Offline. Last score 3 min ago." Who logged it
 * follows: " · logged by Ade (host)".
 */
export function freshness(p: {
  updatedAt: number;
  now: number;
  loggedBy?: string | undefined;
  offline?: boolean | undefined;
}): Freshness {
  const ms = since(p.updatedAt, p.now);
  const a = age(ms);
  const stale = ms >= STALE_AFTER_MS;
  const by = p.loggedBy ? ` · logged by ${p.loggedBy}` : '';
  const spokenBy = p.loggedBy ? `, logged by ${p.loggedBy}` : '';
  if (p.offline) {
    return {
      text: `Offline. Last score ${a.shown} ago${by}`,
      spoken: `Offline. Last score ${a.spoken} ago${spokenBy}`,
      stale: true,
    };
  }
  if (ms < JUST_NOW_MS) {
    return { text: `Updated just now${by}`, spoken: `Updated just now${spokenBy}`, stale: false };
  }
  const tail = stale ? '. Score may be behind.' : '';
  return {
    text: `Updated ${a.shown} ago${by}${tail}`,
    spoken: `Updated ${a.spoken} ago${spokenBy}${tail}`,
    stale,
  };
}

/** A score as shown: whole and never negative. */
export function scoreValue(score: number): number {
  return Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
}

/** The score section's name: "Score: Lights 3, Darks 2" (the prototype's `aria-label`). */
export function scoreLabel(a: ScoreSide, b: ScoreSide): string {
  const name = (n: string) => n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
  return `Score: ${name(a.name)} ${scoreValue(a.score)}, ${name(b.name)} ${scoreValue(b.score)}`;
}
