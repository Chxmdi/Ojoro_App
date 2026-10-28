/**
 * Times for plans, shown in the place's time zone (docs/SLICE01_CONTRACT.md, Time rules).
 * Pure: Intl only, so it runs in Node and in Hermes. Copy follows the designs: "Tonight 7:30",
 * "Sat 10:00", "Closes at 6:00", "Floodlit until 11 PM".
 */

/** Montréal. Used when a plan has no place yet. */
export const DEFAULT_TIME_ZONE = 'America/Toronto';

const DAY_MS = 24 * 60 * 60 * 1000;
/** From this hour a same-day time reads "Tonight", and yesterday's reads "Last night". */
const EVENING_HOUR = 17;

export type ZonedParts = {
  year: number;
  /** 1–12. */
  month: number;
  day: number;
  /** 0–23. */
  hour: number;
  minute: number;
  /** "Wed". */
  weekday: string;
  /** "Oct". */
  monthName: string;
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function toDate(at: string | Date | number): Date {
  return at instanceof Date ? at : new Date(at);
}

/** Wall-clock parts of an instant in a time zone. */
export function zonedParts(at: string | Date | number, timeZone: string = DEFAULT_TIME_ZONE): ZonedParts {
  const parts = formatter(timeZone).formatToParts(toDate(at));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  const month = Number(get('month'));
  return {
    year: Number(get('year')),
    month,
    day: Number(get('day')),
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    weekday: get('weekday'),
    monthName: MONTHS[month - 1] ?? '',
  };
}

/**
 * The instant at a wall-clock time in a time zone (e.g. 6 PM in Montréal today). Two passes settle
 * the offset across a daylight-saving change.
 */
export function zonedTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string = DEFAULT_TIME_ZONE,
): Date {
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(guess, timeZone);
    const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += wanted - seen;
  }
  return new Date(guess);
}

/** Calendar days from `now` to `at` in the zone (0 = same day, 1 = tomorrow, -1 = yesterday). */
export function dayDiff(at: string | Date | number, now: Date, timeZone: string = DEFAULT_TIME_ZONE): number {
  const a = zonedParts(at, timeZone);
  const b = zonedParts(now, timeZone);
  return Math.round(
    (Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)) / DAY_MS,
  );
}

/** "7:30", "10:00": 12-hour, no period (the designs drop it when the day word sets the context). */
export function clock(at: string | Date | number, timeZone: string = DEFAULT_TIME_ZONE): string {
  const { hour, minute } = zonedParts(at, timeZone);
  return `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, '0')}`;
}

/** "11 PM", "6:30 PM". */
export function shortClock(hour: number, minute: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  const period = hour % 24 < 12 ? 'AM' : 'PM';
  return minute === 0 ? `${h} ${period}` : `${h}:${String(minute).padStart(2, '0')} ${period}`;
}

/** An instant as "11 PM" / "6:30 PM" in the zone. */
export function clockWithPeriod(at: string | Date | number, timeZone: string = DEFAULT_TIME_ZONE): string {
  const { hour, minute } = zonedParts(at, timeZone);
  return shortClock(hour, minute);
}

/** `places.floodlit_until` ("23:00:00") as "11 PM". Null when not floodlit or unreadable. */
export function floodlitLabel(time: string | null | undefined): string | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return null;
  return shortClock(Number(match[1]), Number(match[2]));
}

/**
 * The day word for a plan: Tonight / Today, Tomorrow, Last night / Yesterday, a weekday within the
 * week ("Sat"), else a date ("Sat 7 Nov").
 */
export function dayLabel(
  at: string | Date | number,
  now: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  const diff = dayDiff(at, now, timeZone);
  const p = zonedParts(at, timeZone);
  if (diff === 0) return p.hour >= EVENING_HOUR ? 'Tonight' : 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return p.hour >= EVENING_HOUR ? 'Last night' : 'Yesterday';
  if (diff > 1 && diff < 7) return p.weekday;
  return `${p.weekday} ${p.day} ${p.monthName}`;
}

/** "Tonight 7:30", "Sat 10:00". */
export function planWhen(at: string | Date | number, now: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  return `${dayLabel(at, now, timeZone)} ${clock(at, timeZone)}`;
}

/** "WED 28 OCT" for the Ojoro Daily overline. */
export function dailyDate(now: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  const p = zonedParts(now, timeZone);
  return `${p.weekday} ${p.day} ${p.monthName}`.toUpperCase();
}

/**
 * When a poll or deadline closes, as written after "Closes": "at 6:00" the same day, "tomorrow at
 * 6:00", else "Sat at 6:00".
 */
export function closesLabel(at: string | Date | number, now: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  const diff = dayDiff(at, now, timeZone);
  const time = clock(at, timeZone);
  if (diff === 0) return `at ${time}`;
  if (diff === 1) return `tomorrow at ${time}`;
  return `${zonedParts(at, timeZone).weekday} at ${time}`;
}

/** The plan's title line: the stored title, else sport + day ("FOOTBALL TONIGHT"). Uppercase. */
export function planTitle(
  plan: { title: string | null; sport_name: string; starts_at: string },
  now: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  const title = plan.title?.trim();
  if (title && title.toLowerCase() !== plan.sport_name.toLowerCase()) return title.toUpperCase();
  return `${plan.sport_name} ${dayLabel(plan.starts_at, now, timeZone)}`.toUpperCase();
}
