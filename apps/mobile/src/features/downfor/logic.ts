/**
 * Down For creation (undesigned; HANDOFF.md "What isn't designed yet"): sport, time window,
 * audience, radius and a required expiry. Pure rules for the sheet; the server checks them again
 * (`create_down_for`: expiry_required, expiry_invalid, window_invalid, radius_invalid).
 */
import {
  clockWithPeriod,
  DEFAULT_TIME_ZONE,
  dayDiff,
  dayLabel,
  zonedParts,
  zonedTime,
} from '../plans/time';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

export type WindowId = 'tonight' | 'tomorrow-morning' | 'tomorrow-evening' | 'weekend';

export type TimeWindow = {
  id: WindowId;
  /** Chip label, sentence case. */
  label: string;
  start: string;
  end: string;
};

/** Down For needs at least this much of the window left. */
const MIN_WINDOW_LEFT = 30 * MINUTE;

function at(base: Date, dayOffset: number, hour: number, minute: number, timeZone: string): Date {
  const p = zonedParts(new Date(base.getTime() + dayOffset * 24 * HOUR), timeZone);
  return zonedTime(p.year, p.month, p.day, hour, minute, timeZone);
}

/** Rounds up to the next quarter hour. */
function ceilQuarter(t: number): number {
  const q = 15 * MINUTE;
  return Math.ceil(t / q) * q;
}

/**
 * The windows offered: tonight (from now or 6 PM until 11 PM, while 30 minutes are left), tomorrow
 * morning (7–11) and evening (6–11 PM), and the next Saturday daytime (9 AM–6 PM). Every window is
 * within 24 h long and 14 days out, as `create_down_for` requires.
 */
export function windowOptions(now: Date, timeZone: string = DEFAULT_TIME_ZONE): TimeWindow[] {
  const out: TimeWindow[] = [];
  const tonightEnd = at(now, 0, 23, 0, timeZone);
  const tonightStart = Math.max(at(now, 0, 18, 0, timeZone).getTime(), ceilQuarter(now.getTime()));
  if (tonightEnd.getTime() - tonightStart >= MIN_WINDOW_LEFT) {
    out.push({
      id: 'tonight',
      label: 'Tonight',
      start: new Date(tonightStart).toISOString(),
      end: tonightEnd.toISOString(),
    });
  }
  out.push({
    id: 'tomorrow-morning',
    label: 'Tomorrow morning',
    start: at(now, 1, 7, 0, timeZone).toISOString(),
    end: at(now, 1, 11, 0, timeZone).toISOString(),
  });
  out.push({
    id: 'tomorrow-evening',
    label: 'Tomorrow evening',
    start: at(now, 1, 18, 0, timeZone).toISOString(),
    end: at(now, 1, 23, 0, timeZone).toISOString(),
  });
  // Next Saturday after tomorrow (Saturday = 6 in getUTCDay of the zoned date).
  const today = zonedParts(now, timeZone);
  const weekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
  let toSaturday = (6 - weekday + 7) % 7;
  if (toSaturday < 2) toSaturday += 7;
  out.push({
    id: 'weekend',
    label: 'This weekend',
    start: at(now, toSaturday, 9, 0, timeZone).toISOString(),
    end: at(now, toSaturday, 18, 0, timeZone).toISOString(),
  });
  return out;
}

export type ExpiryId = 'window-end' | 'window-start' | 'two-hours';

export type ExpiryOption = { id: ExpiryId; label: string; at: string };

/**
 * Until when the Down For stays up. Required, never after the window ends. "When it starts" only
 * when the start is at least 15 minutes away; "In 2 hours" only when that's before the end.
 */
export function expiryOptions(
  window: Pick<TimeWindow, 'start' | 'end'>,
  now: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): ExpiryOption[] {
  const start = Date.parse(window.start);
  const end = Date.parse(window.end);
  const out: ExpiryOption[] = [
    { id: 'window-end', label: `When it ends · ${clockWithPeriod(end, timeZone)}`, at: window.end },
  ];
  if (start - now.getTime() >= 15 * MINUTE) {
    out.push({ id: 'window-start', label: `When it starts · ${clockWithPeriod(start, timeZone)}`, at: window.start });
  }
  const twoHours = ceilQuarter(now.getTime() + 2 * HOUR);
  if (twoHours < end && twoHours > start) {
    out.push({
      id: 'two-hours',
      label: `In 2 hours · ${clockWithPeriod(twoHours, timeZone)}`,
      at: new Date(twoHours).toISOString(),
    });
  }
  return out;
}

export type Audience = 'public' | 'friends';

export const AUDIENCES: readonly { id: Audience; label: string }[] = [
  { id: 'public', label: 'Anyone nearby' },
  // Friends means people you've played with until Friends exist (DESIGN_DECISIONS, Slice 01 backend).
  { id: 'friends', label: "People I've played with" },
];

/** The OnboardWhen radius chips. */
export const RADIUS_CHOICES = [1, 3, 5, 10] as const;

export type DownForForm = {
  sportId: string | null;
  windowId: WindowId | null;
  expiryId: ExpiryId | null;
  audience: Audience;
  radiusKm: number;
};

export type DownForErrors = Partial<Record<'sport' | 'window' | 'expiry', string>>;

/** Words for what's missing or out of date, before anything is sent. */
export function validateDownFor(
  form: DownForForm,
  windows: readonly TimeWindow[],
  now: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): DownForErrors {
  const errors: DownForErrors = {};
  if (!form.sportId) errors.sport = 'Pick a sport.';
  const window = windows.find((w) => w.id === form.windowId);
  if (!window) {
    errors.window = 'Pick when you can play.';
    return errors;
  }
  if (Date.parse(window.end) <= now.getTime()) errors.window = 'That time has passed. Pick another.';
  const expiry = expiryOptions(window, now, timeZone).find((e) => e.id === form.expiryId);
  if (!expiry) errors.expiry = 'Say until when you are down.';
  else if (Date.parse(expiry.at) <= now.getTime()) errors.expiry = 'Pick an end time that is still to come.';
  return errors;
}

export function hasErrors(errors: DownForErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** The `create_down_for` arguments for a valid form. */
export function downForArgs(
  form: DownForForm,
  windows: readonly TimeWindow[],
  key: string,
  now: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): {
  p_idempotency_key: string;
  p_sport_id: string;
  p_window_start: string;
  p_window_end: string;
  p_expires_at: string;
  p_audience: Audience;
  p_radius_km: number;
} | null {
  const window = windows.find((w) => w.id === form.windowId);
  const expiry = window ? expiryOptions(window, now, timeZone).find((e) => e.id === form.expiryId) : undefined;
  if (!form.sportId || !window || !expiry) return null;
  return {
    p_idempotency_key: key,
    p_sport_id: form.sportId,
    // A window that already started begins now; the server rejects a start in the past.
    p_window_start: new Date(Math.max(Date.parse(window.start), now.getTime())).toISOString(),
    p_window_end: window.end,
    p_expires_at: expiry.at,
    p_audience: form.audience,
    p_radius_km: form.radiusKm,
  };
}

/** The Tonight window for a one-tap I'M DOWN on Home, ending when the people down stop being down. */
export function tonightArgs(
  sportId: string,
  key: string,
  latestEnd: string | null,
  now: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): {
  p_idempotency_key: string;
  p_sport_id: string;
  p_window_start: string;
  p_window_end: string;
  p_expires_at: string;
} | null {
  const tonight = windowOptions(now, timeZone).find((w) => w.id === 'tonight');
  const fallbackEnd = tonight ? Date.parse(tonight.end) : null;
  const end = latestEnd ? Date.parse(latestEnd) : fallbackEnd;
  if (end === null || end - now.getTime() < MIN_WINDOW_LEFT) return null;
  const start = Math.max(ceilQuarter(now.getTime()), tonight ? Date.parse(tonight.start) : now.getTime());
  const windowStart = Math.min(start, end - MIN_WINDOW_LEFT);
  const endIso = new Date(end).toISOString();
  return {
    p_idempotency_key: key,
    p_sport_id: sportId,
    p_window_start: new Date(Math.max(windowStart, now.getTime())).toISOString(),
    p_window_end: endIso,
    p_expires_at: endIso,
  };
}

/** "You're down for football tonight until 11 PM." */
export function signalLine(
  signal: { sport_name: string; window_start: string; expires_at: string },
  now: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  const diff = dayDiff(signal.window_start, now, timeZone);
  const day = diff <= 0 ? 'today' : dayLabel(signal.window_start, now, timeZone).toLowerCase();
  const until = clockWithPeriod(signal.expires_at, timeZone);
  const when = day === 'today' && zonedParts(signal.expires_at, timeZone).hour >= 17 ? 'tonight' : day;
  return `You're down for ${signal.sport_name.toLowerCase()} ${when} until ${until}.`;
}
