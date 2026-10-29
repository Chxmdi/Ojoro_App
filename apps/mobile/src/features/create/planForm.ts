/**
 * QUICK PLAN and ACTIVITY (Create): one `create_plan` form (undesigned; kept minimal). Quick Plan
 * is sport, day, time, place, capacity, who can see it and an optional meeting point (members
 * only). Activity adds the host details: title, length, team names, cost (display only), kit,
 * level. "Repeats" has no backend (Rituals/Series are later), so it isn't offered.
 * The server checks everything again (create_plan errors).
 */
import type { RpcArgs } from '@ojoro/contracts';

import { clockWithPeriod, DEFAULT_TIME_ZONE, shortClock, zonedParts, zonedTime } from '../plans/time';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export type PlanKind = 'quick' | 'activity';
export type Audience = 'public' | 'friends' | 'invite_only';

export const AUDIENCE_CHOICES: readonly { id: Audience; label: string }[] = [
  { id: 'public', label: 'Anyone nearby' },
  // Friends means people you've played with until Friends exist (DESIGN_DECISIONS, Slice 01 backend).
  { id: 'friends', label: "People I've played with" },
  { id: 'invite_only', label: 'Only people I invite' },
];

export const DURATION_CHOICES = [45, 60, 90, 120] as const;
export const CAPACITY_MIN = 2;
export const CAPACITY_MAX = 12;
/** create_plan wants the start at least 15 minutes out; we keep a little margin for the tap. */
export const MIN_LEAD_MINUTES = 20;

export type PlanFormState = {
  sportId: string | null;
  /** Days from today in the place's zone (0 = today). */
  dayOffset: number;
  /** Minutes after local midnight (e.g. 19:30 = 1170), or null. */
  minuteOfDay: number | null;
  placeId: string | null;
  capacity: number;
  audience: Audience;
  meetingPoint: string;
  // Activity only
  title: string;
  durationMinutes: number | null;
  teamA: string;
  teamB: string;
  cost: string;
  kit: string;
  level: string;
};

export function initialPlanForm(capacity = 8): PlanFormState {
  return {
    sportId: null,
    dayOffset: 0,
    minuteOfDay: null,
    placeId: null,
    capacity,
    audience: 'public',
    meetingPoint: '',
    title: '',
    durationMinutes: null,
    teamA: '',
    teamB: '',
    cost: '',
    kit: '',
    level: '',
  };
}

export type DayChoice = { offset: number; label: string };

/** Today, Tomorrow, then the next five weekdays ("Sat 31"). */
export function dayChoices(now: Date, timeZone: string = DEFAULT_TIME_ZONE): DayChoice[] {
  const out: DayChoice[] = [];
  for (let offset = 0; offset < 7; offset++) {
    if (offset === 0) out.push({ offset, label: 'Today' });
    else if (offset === 1) out.push({ offset, label: 'Tomorrow' });
    else {
      const p = zonedParts(new Date(now.getTime() + offset * DAY), timeZone);
      out.push({ offset, label: `${p.weekday} ${p.day}` });
    }
  }
  return out;
}

/** Half-hour start times from 6 AM to 10 PM. */
export function timeChoices(): { minute: number; label: string }[] {
  const out: { minute: number; label: string }[] = [];
  for (let m = 6 * 60; m <= 22 * 60; m += 30) out.push({ minute: m, label: shortClock(Math.floor(m / 60), m % 60) });
  return out;
}

/** The start instant for a day offset and minute of day, in the zone. */
export function startsAt(dayOffset: number, minuteOfDay: number, now: Date, timeZone: string = DEFAULT_TIME_ZONE): Date {
  const p = zonedParts(new Date(now.getTime() + dayOffset * DAY), timeZone);
  return zonedTime(p.year, p.month, p.day, Math.floor(minuteOfDay / 60), minuteOfDay % 60, timeZone);
}

/** Times still possible on the chosen day (today drops the ones too soon to gather people). */
export function timeChoicesFor(dayOffset: number, now: Date, timeZone: string = DEFAULT_TIME_ZONE) {
  return timeChoices().filter(
    (t) => startsAt(dayOffset, t.minute, now, timeZone).getTime() - now.getTime() >= MIN_LEAD_MINUTES * MINUTE,
  );
}

/** "$12" or "12.50" → cents; "" → 0; anything else → null. */
export function parseCost(text: string): number | null {
  const t = text.replace(/[$\s]/g, '').replace(',', '.');
  if (t === '') return 0;
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

export type PlanFormErrors = Partial<
  Record<'sport' | 'time' | 'place' | 'capacity' | 'cost' | 'meetingPoint' | 'title', string>
>;

export function validatePlanForm(
  f: PlanFormState,
  kind: PlanKind,
  now: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): PlanFormErrors {
  const e: PlanFormErrors = {};
  if (!f.sportId) e.sport = 'Pick a sport.';
  if (f.minuteOfDay === null) e.time = 'Pick a start time.';
  else if (startsAt(f.dayOffset, f.minuteOfDay, now, timeZone).getTime() - now.getTime() < MIN_LEAD_MINUTES * MINUTE) {
    e.time = `Pick a time at least ${MIN_LEAD_MINUTES} minutes from now, so people can get there.`;
  }
  if (!f.placeId) e.place = 'Pick where you will play.';
  if (!Number.isInteger(f.capacity) || f.capacity < CAPACITY_MIN || f.capacity > CAPACITY_MAX) {
    e.capacity = `Plans hold ${CAPACITY_MIN} to ${CAPACITY_MAX} people.`;
  }
  if (f.meetingPoint.trim().length > 120) e.meetingPoint = 'Keep the meeting point under 120 characters.';
  if (kind === 'activity') {
    if (parseCost(f.cost) === null) e.cost = 'Write the cost as a number, like 5 or 7.50.';
    if (f.title.trim().length > 60) e.title = 'Keep the title under 60 characters.';
  }
  return e;
}

export function hasPlanErrors(e: PlanFormErrors): boolean {
  return Object.keys(e).length > 0;
}

type CreateArgs = Omit<RpcArgs<'create_plan'>, 'p_idempotency_key'>;

const opt = (v: string) => {
  const t = v.trim();
  return t.length > 0 ? t : undefined;
};

/** The `create_plan` arguments for a valid form (null when it isn't). */
export function planArgs(
  f: PlanFormState,
  kind: PlanKind,
  now: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): CreateArgs | null {
  if (hasPlanErrors(validatePlanForm(f, kind, now, timeZone))) return null;
  const args: CreateArgs = {
    p_sport_id: f.sportId as string,
    p_starts_at: startsAt(f.dayOffset, f.minuteOfDay as number, now, timeZone).toISOString(),
    p_capacity: f.capacity,
    p_place_id: f.placeId as string,
    p_audience: f.audience,
  };
  const meet = opt(f.meetingPoint);
  if (meet) args.p_meeting_point = meet;
  if (kind === 'activity') {
    const title = opt(f.title);
    if (title) args.p_title = title;
    if (f.durationMinutes) args.p_duration_minutes = f.durationMinutes;
    const a = opt(f.teamA);
    const b = opt(f.teamB);
    if (a) args.p_team_a_label = a;
    if (b) args.p_team_b_label = b;
    const kit = opt(f.kit);
    if (kit) args.p_kit_note = kit;
    const level = opt(f.level);
    if (level) args.p_level_label = level;
    const cents = parseCost(f.cost);
    if (cents) args.p_cost_cents = cents;
  }
  return args;
}

/** The line under the form's button: what will happen, in words. */
export function planSummary(
  f: Pick<PlanFormState, 'dayOffset' | 'minuteOfDay' | 'capacity'>,
  dayLabelText: string,
  now: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  if (f.minuteOfDay === null) return `You host and you're in. It locks at ${f.capacity}: that's GAME ON.`;
  const at = clockWithPeriod(startsAt(f.dayOffset, f.minuteOfDay, now, timeZone), timeZone);
  return `${dayLabelText} at ${at}. You host and you're in. It locks at ${f.capacity}: that's GAME ON.`;
}
