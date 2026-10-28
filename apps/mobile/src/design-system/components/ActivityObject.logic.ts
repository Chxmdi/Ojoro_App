/**
 * Pure rules for `ActivityObject` (web reference `function ActivityObject`
 * and `.oj-activity`; components/ActivityObject.md). No React Native imports,
 * so it runs in Node.
 */

export const ACTIVITY_OBJECT_STATUSES = ['forming', 'confirmed', 'live'] as const;
export type ActivityObjectStatus = (typeof ACTIVITY_OBJECT_STATUSES)[number];

export type ActivitySituation = 'calm' | 'confirmed' | 'live';

/** Avatars shown before +N (web: `max: 5`). */
export const ACTIVITY_CLUSTER_MAX = 5;
/** At most this many dashed open spots while forming. */
export const ACTIVITY_OPEN_SPOTS_MAX = 2;

/** The status tag beside the title. */
export type ActivityObjectTag =
  { kind: 'live' } | { kind: 'badge'; tone: 'neutral' | 'signal'; text: string };

/** What the join button shows: none, I'M DOWN, or YOU'RE DOWN. */
export type ActivityJoin = 'none' | 'join' | 'joined';

export type ActivityObjectModelInput = {
  activity: string;
  day: string;
  time: string;
  place: string;
  distance?: string | undefined;
  count: number;
  capacity: number;
  status?: ActivityObjectStatus | undefined;
  joined?: boolean | undefined;
};

export type ActivityObjectModel = {
  status: ActivityObjectStatus;
  situation: ActivitySituation;
  left: number;
  /** Forming and every spot taken. */
  full: boolean;
  tag: ActivityObjectTag;
  /** "Jeanne-Mance Park · 1.2 km". */
  where: string;
  openSpots: number;
  join: ActivityJoin;
  accessibilityLabel: string;
};

function whole(n: number | undefined): number {
  return n && n > 0 && Number.isFinite(n) ? Math.floor(n) : 0;
}

export function activityObjectModel({
  activity,
  day,
  time,
  place,
  distance,
  count,
  capacity,
  status = 'forming',
  joined = false,
}: ActivityObjectModelInput): ActivityObjectModel {
  const c = whole(count);
  const cap = whole(capacity);
  const left = Math.max(0, cap - c);
  const forming = status === 'forming';
  const full = forming && cap > 0 && left === 0;
  return {
    status,
    situation: status === 'confirmed' ? 'confirmed' : status === 'live' ? 'live' : 'calm',
    left,
    full,
    tag:
      status === 'live'
        ? { kind: 'live' }
        : status === 'confirmed'
          ? { kind: 'badge', tone: 'signal', text: 'GAME ON' }
          : full
            ? { kind: 'badge', tone: 'neutral', text: 'FULL' }
            : { kind: 'badge', tone: 'neutral', text: `${c} / ${cap}` },
    where: distance ? `${place} · ${distance}` : place,
    openSpots: forming ? Math.min(left, ACTIVITY_OPEN_SPOTS_MAX) : 0,
    // Full and not in: no button you can't use. In already: YOU'RE DOWN stays.
    join: !forming ? 'none' : joined ? 'joined' : full ? 'none' : 'join',
    accessibilityLabel: activityObjectLabel({
      activity,
      day,
      time,
      place,
      count: c,
      capacity: cap,
      status,
      full,
    }),
  };
}

/** "TONIGHT" reads as "Tonight"; "Thu" stays "Thu". Screen readers spell some all-caps words. */
export function spokenDay(day: string): string {
  return day.length > 1 && day === day.toUpperCase() && /[A-Z]/.test(day)
    ? day.charAt(0) + day.slice(1).toLowerCase()
    : day;
}

/**
 * The spec sentence ("Pickup football, Thu 7:30, Jeanne-Mance Park. 6 of 10
 * in."), plus the status in words, since the tag is inside the one element
 * screen readers stop on: " Game on.", " Live now.", " Full."
 */
export function activityObjectLabel({
  activity,
  day,
  time,
  place,
  count,
  capacity,
  status,
  full,
}: {
  activity: string;
  day: string;
  time: string;
  place: string;
  count: number;
  capacity: number;
  status: ActivityObjectStatus;
  full: boolean;
}): string {
  const state =
    status === 'confirmed' ? ' Game on.' : status === 'live' ? ' Live now.' : full ? ' Full.' : '';
  return `${activity}, ${spokenDay(day)} ${time}, ${place}. ${count} of ${capacity} in.${state}`;
}

/**
 * Breakthrough plays when a forming activity fills and turns confirmed.
 * Not on first render, not confirmed → live (that's a start, not a threshold).
 */
export function isActivityBreakthrough(
  previous: ActivityObjectStatus | undefined,
  next: ActivityObjectStatus,
): boolean {
  return previous === 'forming' && next === 'confirmed';
}
