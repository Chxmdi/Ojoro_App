/**
 * Time, place and count words for the activity screens. Pure (Intl only), so it runs in Node.
 * Times are shown in the place's time zone (contract, Time rules), 12-hour, without seconds.
 */

export const DEFAULT_TIME_ZONE = 'America/Toronto';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export type ZonedParts = {
  year: number;
  /** 1–12. */
  month: number;
  day: number;
  /** 0 = Sunday. */
  weekday: number;
  /** 0–23. */
  hour: number;
  minute: number;
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

function toDate(at: string | number | Date): Date {
  return at instanceof Date ? at : new Date(at);
}

/** Wall-clock parts of an instant in a time zone. */
export function zonedParts(at: string | number | Date, timeZone: string = DEFAULT_TIME_ZONE): ZonedParts {
  const date = toDate(at);
  const parts: Record<string, number> = {};
  for (const p of formatterFor(timeZone).formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  const year = parts.year ?? 1970;
  const month = parts.month ?? 1;
  const day = parts.day ?? 1;
  return {
    year,
    month,
    day,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    hour: (parts.hour ?? 0) % 24,
    minute: parts.minute ?? 0,
  };
}

/** The instant at a wall-clock time in a time zone (handles daylight saving changes). */
export function zonedTime(
  wall: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string = DEFAULT_TIME_ZONE,
): Date {
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  let guess = asUtc;
  for (let i = 0; i < 2; i += 1) {
    const p = zonedParts(guess, timeZone);
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += asUtc - shown;
  }
  return new Date(guess);
}

/** Days between two calendar dates (b − a), ignoring time. */
function dayDiff(a: ZonedParts, b: ZonedParts): number {
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000,
  );
}

/** "7:30". */
export function clock(at: string | number | Date, timeZone?: string): string {
  const p = zonedParts(at, timeZone);
  const h = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${h}:${p.minute.toString().padStart(2, '0')}`;
}

function period(p: ZonedParts): string {
  return p.hour < 12 ? 'AM' : 'PM';
}

/** "7:04 PM". */
export function clockWithPeriod(at: string | number | Date, timeZone?: string): string {
  return `${clock(at, timeZone)} ${period(zonedParts(at, timeZone))}`;
}

/** "9 PM", or "9:30 PM" when not on the hour. */
export function hourWithPeriod(at: string | number | Date, timeZone?: string): string {
  const p = zonedParts(at, timeZone);
  const h = p.hour % 12 === 0 ? 12 : p.hour % 12;
  const m = p.minute === 0 ? '' : `:${p.minute.toString().padStart(2, '0')}`;
  return `${h}${m} ${period(p)}`;
}

/** The day over the time on the ActivityObject: TONIGHT, TODAY, TOMORROW, THU, or THU 6 NOV. */
export function dayLabel(at: string, now: Date, timeZone?: string): string {
  const p = zonedParts(at, timeZone);
  const diff = dayDiff(zonedParts(now, timeZone), p);
  if (diff === 0) return p.hour >= 17 ? 'TONIGHT' : 'TODAY';
  if (diff === 1) return 'TOMORROW';
  if (diff === -1) return 'YESTERDAY';
  const weekday = WEEKDAYS[p.weekday]!.toUpperCase();
  if (diff > 1 && diff < 7) return weekday;
  return `${weekday} ${p.day} ${MONTHS[p.month - 1]!.toUpperCase()}`;
}

/** "Tue 6 Oct". */
export function shortDate(at: string | number | Date, timeZone?: string): string {
  const p = zonedParts(at, timeZone);
  return `${WEEKDAYS[p.weekday]} ${p.day} ${MONTHS[p.month - 1]}`;
}

/** "TUE 6 OCT" (overlines). */
export function dateLabel(at: string | number | Date, timeZone?: string): string {
  return shortDate(at, timeZone).toUpperCase();
}

/** "Tue 7:30" (time chips). */
export function weekdayClock(at: string | number | Date, timeZone?: string): string {
  return `${WEEKDAYS[zonedParts(at, timeZone).weekday]} ${clock(at, timeZone)}`;
}

/** "WED 9 PM" (After's closing time). */
export function weekdayHour(at: string | number | Date, timeZone?: string): string {
  return `${WEEKDAYS[zonedParts(at, timeZone).weekday]!.toUpperCase()} ${hourWithPeriod(at, timeZone)}`;
}

/** "06.10.26" (Passport stamp). */
export function stampDate(at: string | number | Date, timeZone?: string): string {
  const p = zonedParts(at, timeZone);
  const two = (n: number) => n.toString().padStart(2, '0');
  return `${two(p.day)}.${two(p.month)}.${two(p.year % 100)}`;
}

/** "March", or "March 2025" when not in the year of `now`. */
export function monthSince(at: string, now: Date, timeZone?: string): string {
  const p = zonedParts(at, timeZone);
  const name = MONTH_NAMES[p.month - 1]!;
  return p.year === zonedParts(now, timeZone).year ? name : `${name} ${p.year}`;
}

/** "Jeanne-Mance Park" → "Jeanne-Mance"; "Parc La Fontaine" → "La Fontaine". */
export function shortPlace(name: string): string {
  const short = name
    .replace(/^(parc|park)\s+/i, '')
    .replace(/\s+(park|parc)$/i, '')
    .trim();
  return short || name;
}

/** "Free", "$12", "$12.50". Display only: payments aren't in Slice 01. */
export function costLabel(cents: number, currency = 'CAD'): string {
  if (cents <= 0) return 'Free';
  const symbol = ['CAD', 'USD', 'AUD', 'NZD'].includes(currency) ? '$' : `${currency} `;
  const whole = cents % 100 === 0;
  return `${symbol}${whole ? cents / 100 : (cents / 100).toFixed(2)}`;
}

/** The attendance rule in the details grid. */
export function attendanceRuleLabel(rule: string): string {
  return rule === 'check_in_host_confirms'
    ? 'Check-in at the pitch. Host confirms.'
    : 'Check-in at the pitch.';
}

/** "Lena", "Lena and Joel", "Lena, Sam, Yara and Tolu". */
export function namesList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "Ade B" → "Ade". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** "1st", "2nd", "12th", "21st". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/** Great-circle distance in km. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** "1.2 km", "800 m". */
export function distanceLabel(km: number): string {
  if (km < 1) return `${Math.max(100, Math.round((km * 1000) / 100) * 100)} m`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}
