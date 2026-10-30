/**
 * Pure logic for Place (`/place/[id]`, Place.png) and the parts Pulse shares with it
 * (docs/PLACES_CONTRACT.md): the header words, TONIGHT HERE rows, RITUALS HERE rows, HOSTS HERE,
 * the busy bars, DIRECTIONS and the create prefill. No React here, so it is unit-tested.
 */
import {
  busyBars,
  busyPartLabel,
  groupCadence,
  groupTag,
  hostedHereWords,
  tonightTag,
  type PlaceGroup,
  type PlaceHost,
  type PlaceTonightItem,
  type PlaceView,
} from '@ojoro/contracts';
import type { Href } from 'expo-router';

import { clock, DEFAULT_TIME_ZONE, zonedParts } from '../plans/time';

/* ---------- Header ---------- */

/** "PLATEAU · 1.2 KM", or just the area without a distance. */
export function placeOverline(view: Pick<PlaceView, 'area' | 'distance_km'>): string {
  const parts = [view.area.toUpperCase()];
  if (view.distance_km != null) parts.push(`${formatKm(view.distance_km)} KM`);
  return parts.join(' · ');
}

/** "JEANNE-MANCE PARK." The display face is uppercase; the full stop is the design's. */
export function placeTitle(name: string): string {
  const upper = name.trim().toUpperCase();
  return /[.!?]$/.test(upper) ? upper : `${upper}.`;
}

/** 1.2 → "1.2", 3 → "3", 12.345 → "12.3". */
export function formatKm(km: number): string {
  const r = Math.round(km * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

const VERIFICATION_WORDS: Record<string, string | null> = {
  listed: null,
  community_confirmed: 'Confirmed by games played here',
  venue_verified: 'Verified by the venue',
};

/** Words for how Ojoro knows the place (never colour only). Null for a plain listing. */
export function verificationWords(v: string): string | null {
  return VERIFICATION_WORDS[v] ?? null;
}

/** The hero photo's words: what it shows, never "photo". */
export function heroAlt(view: Pick<PlaceView, 'name' | 'area'>): string {
  return `${view.name}, ${view.area}`;
}

/* ---------- Routes ---------- */

export const objectRoutes = {
  plan: (id: string) => ({ pathname: '/plan/[id]', params: { id } }) as unknown as Href,
  activity: (id: string) => `/activity/${id}` as Href,
  clan: (id: string) => `/clan/${id}` as Href,
  crew: (id: string) => `/crew/${id}` as Href,
  profile: (id: string) => `/profile/${id}` as Href,
};

/* ---------- Tonight here ---------- */

export type TonightStrip = {
  key: string;
  time: string;
  activity: string;
  place: string;
  status: 'forming' | 'confirmed' | 'live' | 'full';
  count: number | undefined;
  capacity: number | undefined;
  href: Href | null;
  /** The ActivityStrip's tag in words, for tests and labels ("6 / 8", GAME ON, LIVE). */
  tag: string;
  iAmIn: boolean;
};

function capitalise(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/** Where a TONIGHT HERE row opens: the plan, the game, or the clan (club runs have no screen). */
export function tonightRoute(item: Pick<PlaceTonightItem, 'kind' | 'plan_id' | 'activity_id' | 'clan_id'>): Href | null {
  if (item.kind === 'activity' && item.activity_id) return objectRoutes.activity(item.activity_id);
  if (item.kind === 'plan' && item.plan_id) return objectRoutes.plan(item.plan_id);
  if (item.kind === 'club_run' && item.clan_id) return objectRoutes.clan(item.clan_id);
  if (item.plan_id) return objectRoutes.plan(item.plan_id);
  return null;
}

/**
 * A TONIGHT HERE row as an ActivityStrip: "7:30 · Pickup football · North pitch · mixed level · 6 / 8".
 * The exact spot (meeting point) only arrives for people in the plan; everyone else sees the level.
 */
export function tonightStrip(item: PlaceTonightItem): TonightStrip {
  const tz = item.time_zone || DEFAULT_TIME_ZONE;
  const level = item.level_label?.trim() || null;
  const spot = item.meeting_point?.trim() || null;
  const sub = [spot, spot && level ? level.toLowerCase() : level].filter(Boolean).join(' · ');
  const status: TonightStrip['status'] =
    item.status === 'live'
      ? 'live'
      : item.status === 'game_on'
        ? 'confirmed'
        : item.capacity > 0 && item.member_count >= item.capacity
          ? 'full'
          : 'forming';
  return {
    key: `${item.kind}:${item.plan_id ?? item.activity_id ?? item.clan_run_id ?? item.starts_at}`,
    time: clock(item.starts_at, tz),
    activity: item.title?.trim() || capitalise(item.sport_name),
    place: sub || capitalise(item.sport_name),
    status,
    count: status === 'forming' || status === 'full' ? item.member_count : undefined,
    capacity: status === 'forming' || status === 'full' ? item.capacity : undefined,
    href: tonightRoute(item),
    tag: tonightTag(item),
    iAmIn: item.i_am_in,
  };
}

/* ---------- Rituals here ---------- */

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export type GroupRow = {
  key: string;
  day: string;
  dayName: string;
  title: string;
  meta: string;
  tag: string;
  href: Href | null;
  iAmIn: boolean;
};

/** Where a RITUALS HERE row opens. A host series has no participant screen yet (not designed). */
export function groupRoute(g: Pick<PlaceGroup, 'kind' | 'group_id'>): Href | null {
  if (g.kind === 'crew_ritual') return objectRoutes.crew(g.group_id);
  if (g.kind === 'clan_ritual') return objectRoutes.clan(g.group_id);
  return null;
}

/** "Thursday FC · football", or "Sunrise run · 6 km" for a run with a distance. */
export function groupTitle(g: Pick<PlaceGroup, 'title' | 'group_name' | 'sport_name' | 'distance_km'>): string {
  const name = g.title?.trim() || g.group_name;
  const tail = g.distance_km != null && g.distance_km > 0 ? `${formatKm(g.distance_km)} km` : g.sport_name.toLowerCase();
  return `${name} · ${tail}`;
}

export function groupRow(g: PlaceGroup): GroupRow {
  const first = [...(g.days ?? [])].sort((a, b) => a - b)[0];
  const i = first != null && first >= 1 && first <= 7 ? first - 1 : null;
  return {
    key: `${g.kind}:${g.id}`,
    day: i != null ? DAYS[i]! : '',
    dayName: i != null ? DAY_NAMES[i]! : '',
    title: groupTitle(g),
    meta: groupCadence(g),
    tag: groupTag(g),
    href: groupRoute(g),
    iAmIn: g.i_am_in,
  };
}

/* ---------- Hosts here ---------- */

export type HostRow = {
  key: string;
  name: string;
  line: string;
  trusted: boolean;
  href: Href;
};

export function hostRow(h: PlaceHost): HostRow {
  const name = h.display_name?.trim() || (h.handle ? `@${h.handle}` : 'Host');
  const line = [hostedHereWords(h.hosted_here), h.program_name ? `Runs ${h.program_name}` : null]
    .filter(Boolean)
    .join(' · ');
  return { key: h.user_id, name, line, trusted: h.trusted_host, href: objectRoutes.profile(h.user_id) };
}

/* ---------- When it's busy ---------- */

export type BusyBlock = {
  label: string;
  /** The chart's spoken name: "When it's busy, evenings". */
  title: string;
  data: { key: string; label: string; name: string; value: number }[];
  currentIndex: number | null;
  summary: string | null;
  period: string;
};

/** WHEN IT'S BUSY · EVENINGS with the BusyTimes data. Null without history. */
export function busyBlock(
  view: Pick<PlaceView, 'has_busy_history' | 'busy_part' | 'busy_levels' | 'today_day' | 'busiest_day' | 'busy_summary'>,
): BusyBlock | null {
  if (!view.has_busy_history) return null;
  const bars = busyBars(view);
  if (bars.length === 0) return null;
  const part = busyPartLabel(view.busy_part);
  const current = bars.findIndex((b) => b.isToday);
  return {
    label: part ? `WHEN IT'S BUSY · ${part}` : "WHEN IT'S BUSY",
    title: part ? `When it's busy, ${part.toLowerCase()}` : "When it's busy",
    data: bars.map((b) => ({ key: b.label, label: b.label, name: DAY_NAMES[b.day - 1]!, value: b.level })),
    currentIndex: current >= 0 ? current : null,
    summary: view.busy_summary,
    period: part ? part.toLowerCase() : 'days',
  };
}

/* ---------- Create here ---------- */

export type FormTime = { dayOffset: number; minuteOfDay: number };

/**
 * The create form's day and time from the server's suggested start (`prefill_starts_at`), when it
 * fits the form's choices (today to six days out, 6 AM to 10 PM on the half hour). Null otherwise:
 * the user picks.
 */
export function formTimeFrom(iso: string | null | undefined, now: Date, timeZone: string = DEFAULT_TIME_ZONE): FormTime | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime()) || at.getTime() <= now.getTime()) return null;
  const a = zonedParts(at, timeZone);
  const b = zonedParts(now, timeZone);
  const dayOffset = Math.round((Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)) / 86_400_000);
  const minuteOfDay = a.hour * 60 + a.minute;
  if (dayOffset < 0 || dayOffset > 6) return null;
  if (minuteOfDay % 30 !== 0 || minuteOfDay < 6 * 60 || minuteOfDay > 22 * 60) return null;
  return { dayOffset, minuteOfDay };
}

/* ---------- Directions ---------- */

/** The OS maps app's words for the place: its name and area, never a person's address. */
export function directionsTarget(view: Pick<PlaceView, 'lat' | 'lng' | 'name' | 'area'>) {
  return { lat: view.lat, lng: view.lng, label: `${view.name}, ${view.area}` };
}

/** The share text: the place, its area and what's on, no link to a person. */
export function shareText(view: Pick<PlaceView, 'name' | 'area' | 'facts' | 'tonight_count'>): string {
  const on =
    view.tonight_count > 0
      ? `${view.tonight_count} ${view.tonight_count === 1 ? 'thing' : 'things'} on tonight.`
      : 'Nothing on tonight yet.';
  return `${view.name}, ${view.area}. ${view.facts}. ${on} On Ojoro.`;
}
