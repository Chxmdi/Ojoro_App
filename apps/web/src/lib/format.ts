/** Words and numbers for the admin tool. Counts, not adjectives; sentence case; no exclamation marks. */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Short age of something: "now", "4 min", "3 h", "2 d", "5 wk". */
export function shortAge(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '–';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '–';
  const ms = Math.max(0, now - t);
  if (ms < MIN) return 'now';
  if (ms < HOUR) return `${Math.floor(ms / MIN)} min`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)} h`;
  if (ms < 14 * DAY) return `${Math.floor(ms / DAY)} d`;
  return `${Math.floor(ms / (7 * DAY))} wk`;
}

/** "4 min ago", or "just now". */
export function ago(iso: string | null | undefined, now: number = Date.now()): string {
  const age = shortAge(iso, now);
  if (age === '–') return 'at an unknown time';
  return age === 'now' ? 'just now' : `${age} ago`;
}

/** The accessible long form of an age: "3 hours". */
export function longAge(iso: string | null | undefined, now: number = Date.now()): string {
  const age = shortAge(iso, now);
  const m = /^(\d+) (min|h|d|wk)$/.exec(age);
  if (!m) return age === 'now' ? 'under a minute' : 'unknown';
  const n = Number(m[1]);
  const unit = { min: 'minute', h: 'hour', d: 'day', wk: 'week' }[m[2] as 'min' | 'h' | 'd' | 'wk'];
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

/** Absolute timestamp for tables and audit rows, in the staff member's time zone: "30 Oct 2026, 14:05". */
export function dateTime(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...(timeZone ? { timeZone } : {}),
  }).format(d);
}

/** "1 report", "3 reports". */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** snake_case enum value to sentence case words: "hate_or_harassment" → "Hate or harassment". */
export function humanize(value: string | null | undefined): string {
  if (!value) return '–';
  const words = value.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Phone input to E.164. North American numbers may skip +1; others need + or 00. */
export function normalizePhone(raw: string): { ok: true; e164: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: 'Enter your phone number.' };
  if (/[^\d\s()+.-]/.test(trimmed)) return { ok: false, error: 'Use digits only, with + before the country code.' };
  const plus = trimmed.startsWith('+');
  let digits = trimmed.replace(/\D/g, '');
  if (!plus && digits.startsWith('00')) digits = digits.slice(2);
  else if (!plus && digits.length === 10) digits = `1${digits}`;
  if (digits.startsWith('1') && digits.length !== 11) {
    return { ok: false, error: 'Numbers in Canada and the US have 10 digits after +1.' };
  }
  if (digits.length < 8 || digits.length > 15) {
    return { ok: false, error: 'That number looks too short or too long. Check it and try again.' };
  }
  return { ok: true, e164: `+${digits}` };
}

/** Only digits, at most six. */
export function cleanCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 6);
}

/** A datetime-local input value ("2026-11-06T18:00") for a date some days from now, in local time. */
export function localInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Parses a datetime-local value to ISO, or null when empty or invalid. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
