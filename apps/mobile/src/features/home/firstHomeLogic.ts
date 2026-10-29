/**
 * FirstHome (the low-density Home, FirstHome.png): honest words from `home_density()`,
 * `latent_demand()` and `further_out()` (docs/LIQUIDITY_CONTRACT.md, Ojoro Now and FirstHome).
 * Counts, never adjectives; latent demand as a count only, never people.
 */
import type { HomeDensity, LatentDemandBucket, OjoroNowItem } from '@ojoro/contracts';

import type { TimeWindow, WindowId } from '../downfor/logic';
import { clock, clockWithPeriod, DEFAULT_TIME_ZONE, dayDiff, zonedParts } from '../plans/time';
import { areaName } from '../area/logic';

export type Density = Pick<
  HomeDensity,
  'has_area' | 'area' | 'radius_km' | 'day_number' | 'plans_near' | 'games_near' | 'further_out_count'
>;

export type Bucket = Pick<
  LatentDemandBucket,
  'sport_id' | 'sport_name' | 'part' | 'suggested_start' | 'window_end' | 'people_count'
>;

/** "DAY 1 · SAINT-HENRI"; "DAY 3" without an area. */
export function dayOverline(d: Pick<Density, 'day_number' | 'area' | 'has_area'>): string {
  const day = `DAY ${Math.max(1, d.day_number ?? 1)}`;
  const name = d.has_area ? areaName(d.area) : null;
  return name ? `${day} · ${name.toUpperCase()}` : day;
}

export const FIRST_HOME_HEADLINE = 'QUIET HERE.\nFOR NOW.';

/** How a sport reads after "want to": run, ride, climb, box, play football. */
export function sportVerb(sportId: string, sportName: string): string {
  const verbs: Record<string, string> = { running: 'run', cycling: 'ride', climbing: 'climb', boxing: 'box' };
  return verbs[sportId] ?? `play ${sportName.toLowerCase()}`;
}

const PART_WORD: Record<string, string> = { morning: 'morning', midday: 'afternoon', evening: 'evening' };

/** When a bucket is, relative to now: "tonight", "this morning", "tomorrow evening", "on Sat evening". */
export function bucketWhen(
  b: Pick<Bucket, 'part' | 'suggested_start'>,
  now: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  const part = PART_WORD[b.part] ?? 'evening';
  const diff = dayDiff(b.suggested_start, now, timeZone);
  if (diff <= 0) return b.part === 'evening' ? 'tonight' : `this ${part}`;
  if (diff === 1) return `tomorrow ${part}`;
  return `on ${zonedParts(b.suggested_start, timeZone).weekday} ${part}`;
}

/** The body under QUIET HERE. FOR NOW.: what's near (0 or 1 things), then the demand, then further out. */
export function firstHomeBody(
  d: Density,
  bucket: Bucket | null,
  now: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  if (!d.has_area) return "Pick your area and Ojoro shows what's starting around it.";
  const plans = d.plans_near ?? 0;
  const games = d.games_near ?? 0;
  const total = plans + games;
  let lead: string;
  if (total === 0) lead = "Nothing's scheduled near you yet.";
  else if (total === 1) lead = plans === 1 ? 'One plan is forming near you this week.' : 'One game is on near you this week.';
  else lead = `${total} plans and games near you this week.`;
  if (bucket && bucket.people_count > 0) {
    const n = bucket.people_count;
    const joiner = total === 0 ? 'But' : 'And';
    return `${lead} ${joiner} ${n} ${n === 1 ? 'person' : 'people'} within ${d.radius_km ?? 3} km want to ${sportVerb(bucket.sport_id, bucket.sport_name)} ${bucketWhen(bucket, now, timeZone)}.`;
  }
  const further = d.further_out_count ?? 0;
  if (further > 0) {
    return `${lead} ${further} ${further === 1 ? 'thing is' : 'things are'} on a bit further out.`;
  }
  return `${lead} Say what you're down for and Ojoro gathers people around it.`;
}

/** PEOPLE WANT THIS: the bucket in one of your sports first (your main sport first), else the first. */
export function pickBucket<T extends Pick<Bucket, 'sport_id'>>(buckets: readonly T[], mySports: readonly string[]): T | null {
  for (const sport of mySports) {
    const hit = buckets.find((b) => b.sport_id === sport);
    if (hit) return hit;
  }
  return buckets[0] ?? null;
}

/** The band's words. The plan forms when you add yourself: at count + 1. */
export function demandBand(b: Bucket, now: Date, timeZone: string = DEFAULT_TIME_ZONE) {
  const when = bucketWhen(b, now, timeZone);
  const n = b.people_count;
  const sport = b.sport_name.toLowerCase();
  return {
    overline: 'PEOPLE WANT THIS',
    headline: `${b.sport_name} ${when}.`.toUpperCase(),
    summary: `${n} ${n === 1 ? 'person' : 'people'} nearby ${n === 1 ? 'is' : 'are'} down for ${sport} ${when}, from ${clockWithPeriod(b.suggested_start, timeZone)}. Add yourself and it becomes a plan at ${n + 1}.`,
    threshold: n + 1,
  };
}

export type QuickChip = { sportId: string; windowId: WindowId; label: string };

/**
 * The one-tap Down For chips: up to three of your sports (main first), each with its own window so
 * the row offers different times: the soonest (tonight, else tomorrow evening), then tomorrow, then
 * the weekend. "Something else" (the sheet) is added by the screen.
 */
export function quickChips(
  sports: readonly { id: string; name: string }[],
  windows: readonly Pick<TimeWindow, 'id' | 'label'>[],
): QuickChip[] {
  const has = (id: WindowId) => windows.some((w) => w.id === id);
  const label = (id: WindowId) => windows.find((w) => w.id === id)?.label.toLowerCase() ?? '';
  const first: WindowId = has('tonight') ? 'tonight' : 'tomorrow-evening';
  const second: WindowId = first === 'tonight' ? 'tomorrow-evening' : 'tomorrow-morning';
  const order = ([first, second, 'weekend'] as WindowId[]).filter((w) => has(w));
  return sports.slice(0, order.length).map((s, i) => {
    const windowId = order[i] as WindowId;
    return { sportId: s.id, windowId, label: `${s.name} ${label(windowId)}` };
  });
}

export type FurtherRow = Pick<
  OjoroNowItem,
  | 'kind'
  | 'plan_id'
  | 'activity_id'
  | 'sport_name'
  | 'title'
  | 'starts_at'
  | 'status'
  | 'member_count'
  | 'capacity'
  | 'place_name'
  | 'place_area'
  | 'place_time_zone'
  | 'distance_km'
>;

/** An ActivityStrip from a further-out row: "6:30 · 5K river run · Lachine Canal · 1.8 km · GAME ON". */
export function furtherStrip(r: FurtherRow) {
  const tz = r.place_time_zone || DEFAULT_TIME_ZONE;
  const where = r.place_name ?? r.place_area ?? 'Place to be agreed';
  const km = r.distance_km != null ? ` · ${Number(r.distance_km).toFixed(1)} km` : '';
  return {
    activity: r.title?.trim() || r.sport_name,
    time: clock(r.starts_at, tz),
    place: `${where}${km}`,
    status: r.status === 'live' ? ('live' as const) : r.status === 'game_on' ? ('confirmed' as const) : ('forming' as const),
    count: r.member_count ?? undefined,
    capacity: r.capacity ?? undefined,
  };
}

/** Where a further-out row opens: the Activity for a game, else the Plan. */
export function furtherTarget(r: Pick<FurtherRow, 'kind' | 'plan_id' | 'activity_id'>):
  | { kind: 'activity'; id: string }
  | { kind: 'plan'; id: string } {
  if (r.kind === 'activity' && r.activity_id) return { kind: 'activity', id: r.activity_id };
  return { kind: 'plan', id: r.plan_id };
}

/** The OS share text for INVITE FRIENDS. No names, no place: just what Ojoro is and the link. */
export function inviteMessage(url: string): string {
  return `I'm on Ojoro. Say what you're down for and plans form around it. Come play: ${url}`;
}
