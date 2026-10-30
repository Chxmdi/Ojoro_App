/**
 * Words and small rules for HostHome, HostSeries, HostRoster and HostRequests
 * (docs/HOSTS_CONTRACT.md). Pure, so it runs in Node under vitest. Times are formatted in the
 * program's or place's time zone; counts are numbers, never adjectives; status is always in words.
 */
import {
  formatPrice,
  isoDayShort,
  weekBadge,
  type HostHome,
  type HostNeedsYouItem,
  type HostWeekItem,
  type JoinRequestRow,
  type RosterRow,
  type SeriesSession,
  type SeriesSettings,
  type SeriesView,
  type SessionView,
} from '@ojoro/contracts';

import { clock, firstName, namesList, ordinal, zonedParts } from '../activities/format';

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
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
/** ISO day (1 = Monday … 7 = Sunday) → its name. */
const ISO_DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** 'YYYY-MM-DD' → its parts (a calendar date, no time zone). */
export function dateParts(on: string): { year: number; month: number; day: number } {
  const [y, m, d] = on.slice(0, 10).split('-').map(Number);
  return { year: y ?? 1970, month: m ?? 1, day: d ?? 1 };
}

/** '2026-10-13' → 'Oct 13'. */
export function monthDay(on: string): string {
  const p = dateParts(on);
  return `${MONTHS[p.month - 1]} ${p.day}`;
}

/** '2027-03-30' → 'March 30, 2027'. */
export function longDate(on: string): string {
  const p = dateParts(on);
  return `${MONTH_NAMES[p.month - 1]} ${p.day}, ${p.year}`;
}

/** The weekday of a calendar date: '2026-10-13' → 'TUE'. */
export function dateWeekday(on: string): string {
  const p = dateParts(on);
  return isoDayShort(((new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() + 6) % 7) + 1).toUpperCase();
}

/** An instant as 'Oct 15' in a time zone. */
export function zonedMonthDay(at: string, timeZone: string): string {
  const p = zonedParts(at, timeZone);
  return `${MONTHS[p.month - 1]} ${p.day}`;
}

/** The calendar date 'YYYY-MM-DD' of an instant in a time zone. */
export function zonedDate(at: string | Date, timeZone: string): string {
  const p = zonedParts(at, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Adds days to a calendar date. */
export function addDays(on: string, days: number): string {
  const p = dateParts(on);
  return new Date(Date.UTC(p.year, p.month - 1, p.day + days)).toISOString().slice(0, 10);
}

// HostHome ---------------------------------------------------------------------------------------

/** "3 sessions and a league round. 31 of 36 spots taken, 3 people waiting." */
export function weekHeadline(home: Pick<
  HostHome,
  'sessions_this_week' | 'ops_items_this_week' | 'spots_taken' | 'spots_total' | 'waiting'
>): string {
  const sessions = home.sessions_this_week;
  const rounds = home.ops_items_this_week;
  if (sessions === 0 && rounds === 0) return 'Nothing on this week yet. Add a series to get people moving.';
  const parts: string[] = [];
  if (sessions > 0) parts.push(plural(sessions, 'session'));
  if (rounds > 0) parts.push(rounds === 1 ? 'a league round' : plural(rounds, 'league round'));
  const first = `${parts.join(' and ')}.`;
  if (home.spots_total === 0) return first;
  const waiting = home.waiting > 0 ? `, ${plural(home.waiting, 'person', 'people')} waiting` : '';
  return `${first} ${home.spots_taken} of ${home.spots_total} spots taken${waiting}.`;
}

/** "Tuesday 7-a-side" on a Tuesday → "7-a-side": the day is already in the row's leading column. */
export function withoutWeekday(name: string, weekday: number): string {
  const day = WEEKDAY_NAMES[weekday];
  if (!day) return name;
  const re = new RegExp(`^${day}s?\\s+`, 'i');
  const rest = name.replace(re, '').trim();
  if (!rest || rest === name) return name;
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

export type NeedsYouRow = {
  key: string;
  kind: string;
  title: string;
  meta: string;
  action: string;
  href: string | null;
};

function detailOf(item: { detail: unknown }): Record<string, unknown> {
  return item.detail && typeof item.detail === 'object' && !Array.isArray(item.detail)
    ? (item.detail as Record<string, unknown>)
    : {};
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** One NEEDS YOU row: what it is, in counts, and the one button that answers it. */
export function needsYouRow(programId: string, item: HostNeedsYouItem, index: number): NeedsYouRow {
  const d = detailOf(item);
  const count = item.count ?? 0;
  const name = item.name ?? 'A session';
  const base = `/host/${programId}`;
  const key = `${item.kind ?? 'item'}-${item.session_id ?? item.object_id ?? index}`;
  const row = needsYouWords(base, item, d, count, name);
  return { key, kind: item.kind ?? 'item', ...row };
}

function needsYouWords(
  base: string,
  item: HostNeedsYouItem,
  d: Record<string, unknown>,
  count: number,
  name: string,
): Omit<NeedsYouRow, 'key' | 'kind'> {
  switch (item.kind) {
    case 'join_requests':
      return {
        title: `${plural(count, 'person', 'people')} asked to join`,
        meta: [name, d.approval_required === false ? null : 'approval on'].filter(Boolean).join(' · '),
        action: 'REVIEW',
        href: item.session_id ? `${base}/session/${item.session_id}/requests` : null,
      };
    case 'waitlist_choice': {
      const waiting = num(d.waiting);
      return {
        title: `${plural(count, 'spot')} to fill`,
        meta: [name, waiting != null ? `${waiting} waiting` : null, 'you choose who’s in'].filter(Boolean).join(' · '),
        action: 'CHOOSE',
        href: item.session_id ? `${base}/session/${item.session_id}` : null,
      };
    }
    case 'refund_request': {
      const days = num(d.days_in);
      const what = str(d.pass_name) ?? name;
      return {
        title: `${plural(count || 1, 'refund request')}`,
        meta: [
          item.user_names?.[0] ?? null,
          what ? what.charAt(0).toLowerCase() + what.slice(1) : null,
          days != null ? `cancelled ${plural(days, 'day')} in` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        action: 'DECIDE',
        href: `${base}/payments`,
      };
    }
    case 'league_result': {
      const home = str(d.home) ?? item.user_names?.[0] ?? null;
      const away = str(d.away) ?? item.user_names?.[1] ?? null;
      const hg = num(d.home_goals);
      const ag = num(d.away_goals);
      const score = home && away && hg != null && ag != null ? `${home} ${hg}–${ag} ${away}` : home && away ? `${home} v ${away}` : name;
      const leagueId = str(d.league_id);
      return {
        title: 'League result to confirm',
        meta: [score, d.both_agree === true ? 'both captains agree' : 'captains don’t agree yet'].join(' · '),
        action: 'CONFIRM',
        href: leagueId ? `${base}/league/${leagueId}` : null,
      };
    }
    default:
      return {
        title: count > 1 ? `${name} · ${count}` : name,
        meta: str(d.meta) ?? '',
        action: 'OPEN',
        href: str(d.href),
      };
  }
}

export type WeekRow = {
  key: string;
  day: string;
  title: string;
  meta: string;
  badge: string;
  signal: boolean;
  href: string | null;
};

/** One THIS WEEK row: day, "7-a-side · 7:30", "14 / 14 · 3 waiting · drop-in", and its badge. */
export function weekRow(programId: string, item: HostWeekItem, fallbackTz: string): WeekRow {
  const tz = item.time_zone ?? fallbackTz;
  const at = item.starts_at ?? new Date(0).toISOString();
  const p = zonedParts(at, tz);
  const day = isoDayShort(((p.weekday + 6) % 7) + 1).toUpperCase();
  const name = withoutWeekday(item.name ?? '', p.weekday);
  const badge = weekBadge(item);
  const base = `/host/${programId}`;
  const key = `${item.kind}-${item.session_id ?? item.object_id ?? at}`;
  if (item.kind !== 'session') {
    const d = detailOf(item);
    const round = num(d.round);
    const fixtures = num(d.fixtures);
    const teams = num(d.teams);
    return {
      key,
      day,
      title: round != null ? `${name} · round ${round}` : name,
      meta: [fixtures != null ? plural(fixtures, 'fixture') : null, teams != null ? plural(teams, 'team') : null]
        .filter(Boolean)
        .join(' · '),
      badge,
      signal: false,
      href: item.object_id ? `${base}/league/${item.object_id}` : null,
    };
  }
  const title = `${name} · ${clock(at, tz)}`;
  if (item.status === 'skipped') {
    return { key, day, title, meta: 'Skipped this week', badge, signal: false, href: null };
  }
  const price = item.price_cents ?? 0;
  const member = item.member_price_cents ?? 0;
  const meta = [
    `${item.in_count ?? 0} / ${item.capacity ?? 0}`,
    (item.waitlist_count ?? 0) > 0 ? `${item.waitlist_count} waiting` : null,
    price === 0 ? 'free' : member === 0 && item.members_first ? 'members free' : 'drop-in',
    item.approval_required ? 'approval on' : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const asking = (item.asking_count ?? 0) > 0;
  return {
    key,
    day,
    title,
    meta,
    badge,
    signal: badge === 'FULL',
    href: item.session_id ? `${base}/session/${item.session_id}${asking ? '/requests' : ''}` : null,
  };
}

/** LAST 30 DAYS: a dash when there's nothing to say yet, spoken as words. */
export function statValue(value: number | null, suffix = ''): { shown: string; spoken: string } {
  if (value == null) return { shown: '–', spoken: 'not enough sessions yet' };
  const rounded = Math.round(value);
  return { shown: `${rounded}${suffix}`, spoken: `${rounded}${suffix === '%' ? ' percent' : ''}` };
}

// HostSeries -------------------------------------------------------------------------------------

/** The editable part of a series, as the form holds it. */
export type SeriesForm = {
  name: string;
  place_id: string;
  start_time: string;
  duration_minutes: number;
  capacity: number;
  level: SeriesView['level'];
  repeat_days: number[];
  until_on: string | null;
  join_opens_days: number;
  approval_required: boolean;
  waitlist_auto_fill: boolean;
  members_first: boolean;
  /** Typed text: "$8", "8.50", "Free". */
  price: string;
  /** Typed text: "Included", "$4". */
  member_price: string;
  refund_window: SeriesView['refund_window'];
};

export function seriesForm(s: SeriesView): SeriesForm {
  return {
    name: s.name,
    place_id: s.place_id,
    start_time: s.start_time.slice(0, 5),
    duration_minutes: s.duration_minutes,
    capacity: s.capacity,
    level: s.level,
    repeat_days: [...s.repeat_days].sort((a, b) => a - b),
    until_on: s.until_on,
    join_opens_days: s.join_opens_days,
    approval_required: s.approval_required,
    waitlist_auto_fill: s.waitlist_auto_fill,
    members_first: s.members_first,
    price: priceText(s.price_cents, s.currency),
    member_price: s.member_price_cents === 0 ? 'Included' : priceText(s.member_price_cents, s.currency),
    refund_window: s.refund_window,
  };
}

function priceText(cents: number, currency: string): string {
  return cents === 0 ? 'Free' : formatPrice(cents, currency);
}

/**
 * Typed price → cents. Empty, "free", "included" and "0" are 0; "$8", "8", "8.5", "8.50" work;
 * anything else is null (a validation error in words).
 */
export function parsePrice(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/^[$€£]\s*/, '').replace(/,/g, '.');
  if (t === '' || t === 'free' || t === 'included' || t === '0') return 0;
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(t)) return null;
  const cents = Math.round(Number(t) * 100);
  return cents <= 100000 ? cents : null;
}

export type SeriesErrors = Partial<Record<'name' | 'repeat_days' | 'price' | 'member_price', string>>;

export function validateSeries(f: SeriesForm): SeriesErrors {
  const e: SeriesErrors = {};
  const name = f.name.trim();
  if (name.length === 0) e.name = 'Give the series a name.';
  else if (name.length > 60) e.name = 'Keep the name to 60 characters.';
  if (f.repeat_days.length === 0) e.repeat_days = 'Pick at least one day.';
  if (parsePrice(f.price) == null) e.price = 'Write a price like $8 or 8.50, or Free.';
  if (parsePrice(f.member_price) == null) e.member_price = 'Write a price like $4, or Included.';
  return e;
}

/** The form as settings for `seriesChanges(loaded, edited)`. Call after `validateSeries` passed. */
export function formSettings(f: SeriesForm): SeriesSettings {
  return {
    name: f.name.trim(),
    place_id: f.place_id,
    start_time: f.start_time,
    duration_minutes: f.duration_minutes,
    capacity: f.capacity,
    level: f.level,
    repeat_days: [...f.repeat_days].sort((a, b) => a - b),
    until_on: f.until_on,
    join_opens_days: f.join_opens_days,
    approval_required: f.approval_required,
    waitlist_auto_fill: f.waitlist_auto_fill,
    members_first: f.members_first,
    price_cents: parsePrice(f.price) ?? 0,
    member_price_cents: parsePrice(f.member_price) ?? 0,
    refund_window: f.refund_window,
  };
}

export function toggleDay(days: readonly number[], day: number): number[] {
  return days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b);
}

/** "Every Tuesday since March. Change it once here and every future session follows." */
export function seriesIntro(s: Pick<SeriesView, 'repeat_days' | 'first_session_on'>, now: Date): string {
  const days = [...s.repeat_days].sort((a, b) => a - b).map((d) => ISO_DAY_NAMES[d - 1] ?? '');
  const every = days.length === 7 ? 'Every day' : `Every ${namesList(days)}`;
  let since = '';
  if (s.first_session_on) {
    const p = dateParts(s.first_session_on);
    const month = MONTH_NAMES[p.month - 1];
    since = p.year === now.getFullYear() ? ` since ${month}` : ` since ${month} ${p.year}`;
  }
  return `${every}${since}. Change it once here and every future session follows.`;
}

/** "7 a side. Ojoro balances teams at check-in." */
export function playersHint(capacity: number): string {
  return capacity % 2 === 0
    ? `${capacity / 2} a side. Ojoro balances teams at check-in.`
    : `${capacity} players. Ojoro balances teams at check-in.`;
}

/** '19:30' → '7:30 PM'. */
export function wallClock(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Start times to pick from: every half hour 6:00 AM–10:30 PM, plus the current one. */
export function startTimeChoices(current: string): string[] {
  const out: string[] = [];
  for (let m = 6 * 60; m <= 22 * 60 + 30; m += 30) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  if (!out.includes(current)) out.push(current);
  return out.sort();
}

export function durationLabel(minutes: number): string {
  return `${minutes} min`;
}

export function durationChoices(current: number): number[] {
  const base = [45, 60, 75, 90, 105, 120, 150, 180];
  return (base.includes(current) ? base : [...base, current]).sort((a, b) => a - b);
}

/** "5 days before" / "1 day before" / "The day of". */
export function opensLabel(days: number): string {
  if (days === 0) return 'The day of';
  return `${plural(days, 'day')} before`;
}

export function opensChoices(current: number): number[] {
  const base = [1, 2, 3, 5, 7, 14];
  return (base.includes(current) ? base : [...base, current]).sort((a, b) => a - b);
}

/** WEEKLY UNTIL choices: no end, or the last week of a coming month; plus the current date. */
export function untilChoices(current: string | null, today: string): (string | null)[] {
  const t = dateParts(today);
  const out: (string | null)[] = [null];
  for (const months of [1, 2, 3, 6, 9, 12]) {
    const end = new Date(Date.UTC(t.year, t.month - 1 + months + 1, 0)).toISOString().slice(0, 10);
    out.push(end);
  }
  if (current && !out.includes(current)) out.push(current);
  return out.sort((a, b) => (a === null ? -1 : b === null ? 1 : a.localeCompare(b)));
}

export function untilLabel(until: string | null): string {
  return until ? longDate(until) : 'No end date';
}

/** "Skipping Dec 22 and Dec 29." */
export function skippingHint(dates: readonly string[] | null | undefined): string | undefined {
  if (!dates || dates.length === 0) return undefined;
  return `Skipping ${namesList(dates.map(monthDay))}.`;
}

export function opensHint(f: Pick<SeriesForm, 'members_first'>, membersEarlyHours: number): string | undefined {
  return f.members_first && membersEarlyHours > 0 ? `Members get it ${membersEarlyHours} hours earlier.` : undefined;
}

/** "Applies from Oct 13. The 9 people already in get one message saying what changed." */
export function saveNote(s: Pick<SeriesView, 'applies_from' | 'people_in_upcoming'>): string {
  const from = s.applies_from ? `Applies from ${monthDay(s.applies_from)}. ` : 'Applies to every session from now on. ';
  const n = s.people_in_upcoming;
  if (n === 0) return `${from}Nobody is in yet, so nobody gets a message.`;
  return `${from}${n === 1 ? 'The 1 person' : `The ${n} people`} already in get${n === 1 ? 's' : ''} one message saying what changed.`;
}

export type SessionRowModel = {
  day: string;
  date: string;
  title: string;
  meta: string;
  skipped: boolean;
  action: 'SKIP' | 'RESTORE';
  actionLabel: string;
};

/** NEXT 4 SESSIONS: "9 in · 5 open" and when it opens, or Skipped with why. */
export function sessionRow(s: SeriesSession, tz: string, now: Date): SessionRowModel {
  const date = monthDay(s.occurs_on);
  const day = dateWeekday(s.occurs_on);
  if (s.status === 'skipped') {
    return {
      day,
      date: date.toUpperCase(),
      title: 'Skipped',
      meta: s.skip_reason ?? (s.in_count > 0 ? `${plural(s.in_count, 'person', 'people')} kept their place` : 'Nobody was in yet'),
      skipped: true,
      action: 'RESTORE',
      actionLabel: `Restore ${date}`,
    };
  }
  const t = now.getTime();
  const opens = new Date(s.opens_at).getTime();
  const membersOpen = new Date(s.members_open_at).getTime();
  let meta: string;
  if (t < opens && s.members_first && t >= membersOpen) meta = 'Members are already in';
  else if (t < opens) meta = `Opens to everyone ${zonedMonthDay(s.opens_at, tz)}`;
  else if (s.waitlist_count > 0) meta = `${s.waitlist_count} waiting`;
  else if (s.asking_count > 0) meta = `${s.asking_count} asking`;
  else meta = 'Open to everyone';
  return {
    day,
    date: date.toUpperCase(),
    title: `${s.in_count} in · ${s.open_count} open`,
    meta,
    skipped: false,
    action: 'SKIP',
    actionLabel: `Skip ${date}`,
  };
}

// HostRoster -------------------------------------------------------------------------------------

/** "TONIGHT · 7:30", "TODAY · 10:00", "TOMORROW · 7:30", "TUE OCT 13 · 7:30". */
export function sessionOverline(startsAt: string, tz: string, now: Date): string {
  const p = zonedParts(startsAt, tz);
  const today = zonedParts(now, tz);
  const diff = Math.round(
    (Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(today.year, today.month - 1, today.day)) / 86_400_000,
  );
  const time = clock(startsAt, tz);
  if (diff === 0) return `${p.hour >= 17 ? 'TONIGHT' : 'TODAY'} · ${time}`;
  if (diff === 1) return `TOMORROW · ${time}`;
  const weekday = isoDayShort(((p.weekday + 6) % 7) + 1).toUpperCase();
  return `${weekday} ${MONTHS[p.month - 1]!.toUpperCase()} ${p.day} · ${time}`;
}

/** "TUESDAY 7-A-SIDE." */
export function sessionHeadline(name: string): string {
  // Word joiners keep "7-A-SIDE." on one line, as the design sets it (white-space: nowrap).
  const n = name.trim().toUpperCase().replace(/-/g, '\u2060-\u2060');
  return n.endsWith('.') ? n : `${n}.`;
}

/** "Starts in 50 minutes.", "Starts in 3 hours.", "On now.", "Ended at 9:00.", "Skipped." */
export function startsIn(v: Pick<SessionView, 'starts_at' | 'ends_at' | 'status' | 'effective_status' | 'time_zone'>, now: Date): string {
  if (v.status === 'skipped') return 'Skipped. Everyone in kept their place.';
  if (v.effective_status === 'cancelled') return 'Called off.';
  const start = new Date(v.starts_at).getTime();
  const end = new Date(v.ends_at).getTime();
  const t = now.getTime();
  if (t >= end || v.effective_status === 'complete') return `Ended at ${clock(v.ends_at, v.time_zone)}.`;
  if (t >= start) return 'On now.';
  const minutes = Math.ceil((start - t) / 60_000);
  if (minutes < 60) return `Starts in ${plural(minutes, 'minute')}.`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Starts in ${plural(hours, 'hour')}.`;
  return `Starts in ${plural(Math.round(hours / 24), 'day')}.`;
}

/** "Jeanne-Mance Park · turf 2 · 7:30 to 9:00. Starts in 50 minutes." */
export function sessionLine(v: SessionView, now: Date): string {
  const where = v.place_name ?? v.place_area;
  const when = `${clock(v.starts_at, v.time_zone)} to ${clock(v.ends_at, v.time_zone)}`;
  return `${[where, when].filter(Boolean).join(' · ')}. ${startsIn(v, now)}`;
}

/** "14 / 14 IN · 3 WAITING". */
export function rosterCountLabel(v: Pick<SessionView, 'in_count' | 'capacity' | 'waitlist_count' | 'checked_in_count'>): string {
  const parts = [`${v.in_count} / ${v.capacity} IN`];
  if (v.waitlist_count > 0) parts.push(`${v.waitlist_count} WAITING`);
  if (v.checked_in_count > 0) parts.push(`${v.checked_in_count} CHECKED IN`);
  return parts.join(' · ');
}

/** "Check-in opens at 7:00. Players tap in at the pitch, or you mark them in." */
export function checkInNote(v: Pick<SessionView, 'check_in_opens_at' | 'time_zone' | 'ends_at'>, now: Date): string {
  const opens = new Date(v.check_in_opens_at).getTime();
  if (now.getTime() >= new Date(v.ends_at).getTime()) return 'Check-in is closed. The session is over.';
  if (now.getTime() < opens) {
    return `Check-in opens at ${clock(v.check_in_opens_at, v.time_zone)}. Players tap in at the pitch, or you mark them in.`;
  }
  return 'Check-in is open. Players tap in at the pitch, or you mark them in below.';
}

export function canCheckIn(v: Pick<SessionView, 'check_in_opens_at' | 'ends_at' | 'status'>, now: Date): boolean {
  const t = now.getTime();
  return v.status !== 'skipped' && t >= new Date(v.check_in_opens_at).getTime() && t < new Date(v.ends_at).getTime();
}

function dayWord(at: string, tz: string, now: Date): string {
  const p = zonedParts(at, tz);
  const today = zonedParts(now, tz);
  const diff = Math.round(
    (Date.UTC(today.year, today.month - 1, today.day) - Date.UTC(p.year, p.month - 1, p.day)) / 86_400_000,
  );
  if (diff <= 0) return p.hour < 12 ? 'this morning' : p.hour < 17 ? 'this afternoon' : 'tonight';
  if (diff === 1) return 'yesterday';
  if (diff < 7) return WEEKDAY_NAMES[p.weekday] ?? '';
  return `${MONTHS[p.month - 1]} ${p.day}`;
}

/** The muted line under a name on the roster: who they are to this program, in counts. */
export function rosterMeta(r: RosterRow, tz: string, now: Date): string {
  const parts: string[] = [];
  if (r.checked_in_at) parts.push(`Checked in at ${clock(r.checked_in_at, tz)}`);
  if (r.section === 'dropped') {
    const at = r.dropped_at ? `Dropped at ${clock(r.dropped_at, tz)}.` : 'Dropped.';
    const filled = r.replaced_by_name
      ? ` ${firstName(r.replaced_by_name)} took the spot${r.replaced_at && r.dropped_at && new Date(r.replaced_at).getTime() - new Date(r.dropped_at).getTime() <= 120_000 ? ' a minute later' : ''}.`
      : ' The spot is open.';
    const money = r.payment_detail ? ` ${r.payment_detail}` : '';
    return `${at}${filled}${money}`;
  }
  if (r.section === 'waitlist') {
    const since = r.waitlisted_at ? `Waiting since ${dayWord(r.waitlisted_at, tz, now)}` : 'Waiting';
    const extra = r.first_time
      ? r.approved_via === 'host'
        ? 'first time, approved'
        : 'first time'
      : r.plays_most_dow != null
        ? `plays most ${ISO_DAY_NAMES[r.plays_most_dow - 1] ?? ''}s`
        : null;
    return [since, extra].filter(Boolean).join(' · ');
  }
  if (r.is_host) parts.push('Hosting');
  else if (r.promoted_at) parts.push(`In from the waitlist at ${clock(r.promoted_at, tz)}`);
  else if (r.first_time) {
    parts.push(
      r.approved_via === 'host' && r.approved_at
        ? `First time · you approved them ${dayWord(r.approved_at, tz, now)}`
        : 'First time',
    );
  } else if (r.last12_total > 0) parts.push(`${r.last12_count} of the last ${r.last12_total}`);
  if (r.payment_detail && !r.is_host) parts.push(r.payment_detail);
  return parts.join(' · ');
}

/** Owed and not collected yet (`due`, `due_at_field`): the host can mark it paid at the field. */
export function paymentDue(status: string | null | undefined): boolean {
  return status === 'due' || status === 'due_at_field';
}

/** The roster badge: HOST, or how the spot is paid (ops ledger), or MEMBER. Words, never colour. */
export function rosterBadge(r: RosterRow): { label: string; signal: boolean } | null {
  if (r.is_host) return { label: 'HOST', signal: true };
  if (r.payment_label) return { label: r.payment_label.toUpperCase(), signal: paymentDue(r.payment_status) };
  if (r.is_member) return { label: 'MEMBER', signal: false };
  return null;
}

export type Settlement =
  | { kind: 'not-connected' }
  | { kind: 'settled'; title: string; note: string | null }
  | { kind: 'open'; title: string; note: string | null };

/** "13 of 14 settled" from the ops ledger; nothing from it yet reads as not connected. */
export function settlement(v: Pick<SessionView, 'settled' | 'settle_total' | 'settle_note' | 'price_cents'>): Settlement | null {
  if (v.settled == null || v.settle_total == null) return v.price_cents > 0 ? { kind: 'not-connected' } : null;
  const title = `${v.settled} of ${v.settle_total} settled`;
  return v.settled >= v.settle_total ? { kind: 'settled', title, note: v.settle_note } : { kind: 'open', title, note: v.settle_note };
}

/** The waitlist rule as it stands now. */
export function waitlistNote(
  v: Pick<SessionView, 'waitlist_auto_fill' | 'auto_fill_active' | 'auto_fill_cutoff_at' | 'time_zone'>,
): string {
  const cutoff = clock(v.auto_fill_cutoff_at, v.time_zone);
  if (!v.waitlist_auto_fill) return "This waitlist doesn't fill itself. When a spot opens, you choose who's in and they hear straight away.";
  if (v.auto_fill_active) return `The waitlist fills itself until ${cutoff}. After that, if someone drops, you choose who's in.`;
  return `The waitlist stopped filling itself at ${cutoff}. If someone drops now, you choose who's in and they hear straight away.`;
}

/** ADD A 15TH SPOT. */
export function addSpotLabel(capacity: number): string {
  return `ADD A ${ordinal(capacity + 1).toUpperCase()} SPOT`;
}

/** Waitlist positions, spoken: First, Second… */
export function positionWord(n: number): string {
  return ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'][n - 1] ?? ordinal(n);
}

export function moveUp<T>(list: readonly T[], index: number): T[] {
  if (index <= 0 || index >= list.length) return [...list];
  const out = [...list];
  [out[index - 1], out[index]] = [out[index]!, out[index - 1]!];
  return out;
}

export function moveDown<T>(list: readonly T[], index: number): T[] {
  return moveUp(list, index + 1);
}

// HostRequests -----------------------------------------------------------------------------------

/** "2 WANT IN.", "1 MORE WANTS IN.", "ALL ANSWERED.", "NOBODY'S ASKING." */
export function requestsHeadline(pending: number, decided: number): string {
  if (pending === 0) return decided > 0 ? 'ALL ANSWERED.' : 'NOBODY’S ASKING.';
  if (pending === 1) return decided > 0 ? '1 MORE WANTS IN.' : '1 WANTS IN.';
  return `${pending} WANT IN.`;
}

/** "9 / 12 IN · 3 OPEN · 2 ASKING". */
export function requestsCountLabel(inCount: number, capacity: number, pending: number): string {
  const open = Math.max(0, capacity - inCount);
  return [`${inCount} / ${capacity} IN`, `${open} OPEN`, pending > 0 ? `${pending} ASKING` : null].filter(Boolean).join(' · ');
}

/** "Verdun · about 3 km away". Area only, never an address. */
export function requestArea(r: Pick<JoinRequestRow, 'area' | 'distance_km'>): string | null {
  const away = r.distance_km != null ? `about ${Math.max(1, Math.round(r.distance_km))} km away` : null;
  return [r.area, away].filter(Boolean).join(' · ') || null;
}

/** NEW TO OJORO · 14 OJORO GAMES · SHOWED UP 14 OF 14. No ID badge: there is no ID check yet. */
export function requestFacts(
  r: Pick<JoinRequestRow, 'new_to_ojoro' | 'ojoro_games' | 'showed_up' | 'show_up_of' | 'id_verified'> & {
    stated_level?: string | null | undefined;
  },
): string[] {
  const facts: string[] = [];
  if (r.id_verified) facts.push('ID VERIFIED');
  if (r.new_to_ojoro) facts.push('NEW TO OJORO');
  if (r.ojoro_games > 0) facts.push(r.ojoro_games === 1 ? '1 OJORO GAME' : `${r.ojoro_games} OJORO GAMES`);
  if (r.show_up_of > 0) facts.push(`SHOWED UP ${r.showed_up} OF ${r.show_up_of}`);
  const level = statedLevelWord(r.stated_level);
  if (level) facts.push(`SAYS: ${level.toUpperCase()}`);
  return facts;
}

const LEVEL_WORDS: Record<string, string> = {
  learning: 'beginner',
  casual: 'casual',
  intermediate: 'intermediate',
  advanced: 'advanced',
};

/** The level they declared themselves (host-only here): learning → "beginner". Null when unset. */
export function statedLevelWord(level: string | null | undefined): string | null {
  return level ? (LEVEL_WORDS[level] ?? level) : null;
}

/** "You both play with Chimdi O." / "Joined Ojoro this week, so there is no history yet. Nobody you know." */
export function requestContext(r: Pick<JoinRequestRow, 'shared_names' | 'shared_count' | 'new_to_ojoro' | 'ojoro_games'>): string {
  const names = r.shared_names ?? [];
  let shared: string;
  if (names.length === 0) shared = 'Nobody you know.';
  else {
    const extra = r.shared_count - names.length;
    shared = `You both play with ${extra > 0 ? `${names.join(', ')} and ${plural(extra, 'other')}` : namesList(names)}.`;
  }
  if (r.new_to_ojoro && r.ojoro_games === 0) return `New to Ojoro, so there is no history yet. ${shared}`;
  return shared;
}

const VIA_WORDS: Record<string, string> = {
  played_with: "they've played with you",
  experienced: 'they have 3 or more checked-in games',
  crews: 'they share a crew with you',
  member: "they're a member",
};

/** The answered card: "Grace is in and has been told." / "Declined quietly." */
export function decidedText(r: Pick<JoinRequestRow, 'display_name' | 'status' | 'approved_via'>): string {
  const name = firstName(r.display_name);
  if (r.status === 'declined') return 'Declined quietly.';
  if (r.status === 'withdrawn') return `${name} took the request back.`;
  if (r.approved_via && r.approved_via !== 'host') return `${name} got in straight away: ${VIA_WORDS[r.approved_via] ?? 'a rule let them in'}.`;
  return `${name} is in and has been told.`;
}

/** "Members of Plateau Pickup and Thursday FC." */
export function crewsRuleBody(crewNames: readonly string[] | null | undefined): string {
  if (!crewNames || crewNames.length === 0) return 'Anyone in a crew with one of the hosts.';
  return `Members of ${namesList(crewNames)}.`;
}

export function approvalIntro(approvalRequired: boolean): string {
  return approvalRequired
    ? "Approval is on for this one. You see what they've done on Ojoro and the area they're in, never an address."
    : "Approval is off for this one, so people join straight away. Requests from before it was turned off are here.";
}
