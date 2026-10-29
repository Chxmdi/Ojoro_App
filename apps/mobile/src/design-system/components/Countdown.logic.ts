/**
 * Pure rules for `Countdown` (web reference `function Countdown`;
 * components/Countdown.md). No React Native imports, so it runs in Node.
 */
import { sentenceCase } from './word';

export type CountdownParts = {
  days?: number | undefined;
  hours?: number | undefined;
  minutes?: number | undefined;
  seconds?: number | undefined;
};

type UnitKey = keyof CountdownParts;

/** Units in order, with the short word under each numeral and the spoken word. */
const UNITS: readonly { key: UnitKey; short: string; one: string }[] = [
  { key: 'days', short: 'DAYS', one: 'day' },
  { key: 'hours', short: 'HRS', one: 'hour' },
  { key: 'minutes', short: 'MIN', one: 'minute' },
  { key: 'seconds', short: 'SEC', one: 'second' },
];

export type CountdownUnit = {
  key: UnitKey;
  /** Two digits at least, as the web pads them: "03". */
  value: string;
  /** DAYS · HRS · MIN · SEC. */
  unit: string;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function whole(n: number | undefined): number | undefined {
  if (n == null || !Number.isFinite(n)) return undefined;
  return Math.max(0, Math.floor(n));
}

/** The units that were passed, in order, padded to two digits. */
export function countdownUnits(parts: CountdownParts): CountdownUnit[] {
  return UNITS.flatMap(({ key, short }) => {
    const n = whole(parts[key]);
    return n === undefined ? [] : [{ key, value: String(n).padStart(2, '0'), unit: short }];
  });
}

/**
 * What a screen reader hears: "Starts in: 3 days, 14 hours, 20 minutes".
 * Seconds are never spoken, so the label changes at most once a minute
 * (Countdown.md: announces at most once per minute). Under a minute it reads
 * "less than a minute"; at zero, "now".
 */
export function countdownLabel(parts: CountdownParts, label?: string | undefined): string {
  const spoken = UNITS.filter((u) => u.key !== 'seconds').flatMap(({ key, one }) => {
    const n = whole(parts[key]);
    return n === undefined ? [] : [{ n, one }];
  });
  const head = label ? `${sentenceCase(label)}: ` : '';
  const total = spoken.reduce((sum, s) => sum + s.n, 0);
  if (total === 0) {
    const secs = whole(parts.seconds) ?? 0;
    return head + (secs > 0 ? 'less than a minute' : 'now');
  }
  // Leading zero units ("0 days") are noise when spoken.
  const first = spoken.findIndex((s) => s.n > 0);
  return (
    head +
    spoken
      .slice(first)
      .map((s) => `${s.n} ${s.one}${s.n === 1 ? '' : 's'}`)
      .join(', ')
  );
}

/**
 * Time left (ms) as the parts to show. Days only while there's at least a
 * day; seconds only in the last hour, where hours (always 00) drop out:
 * 3d 14h 20m → DAYS HRS MIN; 5h 2m → HRS MIN; 42m 7s → MIN SEC.
 */
export function countdownParts(msLeft: number): CountdownParts {
  const ms = Number.isFinite(msLeft) ? Math.max(0, msLeft) : 0;
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  const minutes = Math.floor((ms % HOUR) / MINUTE);
  const seconds = Math.floor((ms % MINUTE) / 1000);
  if (ms >= DAY) return { days, hours, minutes };
  if (ms >= HOUR) return { hours, minutes };
  return { minutes, seconds };
}

/**
 * How long until the shown parts next change, so a ticking countdown
 * re-renders once a minute until the last hour, then once a second. Null at
 * zero: nothing left to tick.
 */
export function nextTickDelay(msLeft: number): number | null {
  if (!Number.isFinite(msLeft) || msLeft <= 0) return null;
  const step = msLeft > HOUR ? MINUTE : 1000;
  return msLeft % step || step;
}
