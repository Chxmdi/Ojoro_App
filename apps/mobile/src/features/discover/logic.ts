/**
 * Discover (Discover.png, docs/LIQUIDITY_CONTRACT.md §Discover): search arguments and validation,
 * grouping results, the filter chips, Ojoro Now rows, latent demand copy, people and places cards,
 * the Surprise Me suggestion. Pure rules, no React Native.
 */
import type { DiscoverWhen } from '@ojoro/contracts';

import { clock, clockWithPeriod, dayDiff, dayLabel, DEFAULT_TIME_ZONE, floodlitLabel, zonedParts } from '../plans/time';

/* ---------- Rows (documented nullables, contract rule 2) ---------- */

export type NowItem = {
  kind: string;
  plan_id: string;
  activity_id: string | null;
  sport_id: string;
  sport_name: string;
  title: string | null;
  starts_at: string;
  status: string;
  member_count: number;
  capacity: number;
  spots_left: number | null;
  place_name: string | null;
  place_time_zone: string | null;
  distance_km: number | null;
  minutes_to_start: number | null;
  played_with_count: number | null;
  action: string;
  reasons: string[] | null;
  reason: string | null;
};

export type DemandBucket = {
  sport_id: string;
  sport_name: string;
  window_start: string;
  window_end: string;
  suggested_start: string;
  people_count: number;
};

export type SearchRow = {
  kind: string;
  id: string;
  title: string | null;
  sport_id: string | null;
  sport_name: string | null;
  starts_at: string | null;
  effective_status: string | null;
  member_count: number | null;
  capacity: number | null;
  place_name: string | null;
  place_area: string | null;
  distance_km: number | null;
  plans_tonight: number | null;
  handle: string | null;
  games_with_me: number | null;
};

export type Person = {
  user_id: string;
  display_name: string;
  handle: string;
  area: string | null;
  sports: string[] | null;
  sessions: number | null;
  games_with_me: number | null;
  reason: string | null;
};

export type NearbyPlace = {
  place_id: string;
  name: string;
  area: string | null;
  sport_ids: string[] | null;
  surface: string | null;
  floodlit_until: string | null;
  distance_km: number | null;
  plans_tonight: number | null;
};

export type SuggestionRow = {
  kind: string;
  plan_id: string | null;
  sport_id: string;
  sport_name: string;
  title: string | null;
  starts_at: string;
  place_name: string | null;
  distance_km: number | null;
  member_count: number | null;
  capacity: number | null;
  demand_count: number | null;
  window_start: string | null;
  window_end: string | null;
  reason: string | null;
};

/* ---------- Filters ---------- */

export const KIND_FILTERS = [
  { id: 'everything', label: 'Everything' },
  { id: 'plans', label: 'Activities' },
  { id: 'places', label: 'Places' },
  { id: 'people', label: 'People' },
] as const;
export type KindFilter = (typeof KIND_FILTERS)[number]['id'];

/** The when-chips after the sport chips. `any` is no chip selected. */
export const WHEN_FILTERS: readonly { id: Exclude<DiscoverWhen, 'any'>; label: string }[] = [
  { id: 'now', label: 'Within the hour' },
  { id: 'today', label: 'Today' },
  { id: 'tonight', label: 'Tonight' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'weekend', label: 'This weekend' },
];

/** `discover_search` caps the query at 80 characters. */
export const MAX_QUERY = 80;
/** People match by name from this many characters (and only people who've played with you). */
export const PEOPLE_MIN_QUERY = 2;
/** Typing settles for this long before a search is sent. */
export const SEARCH_DEBOUNCE_MS = 300;

export type Filters = {
  query: string;
  sportId: string | null;
  when: DiscoverWhen | null;
  kind: KindFilter;
};

export const NO_FILTERS: Filters = { query: '', sportId: null, when: null, kind: 'everything' };

export type SearchArgs = { p_query?: string; p_sport_id?: string; p_when?: string };

export type SearchState =
  | { mode: 'browse' }
  | { mode: 'invalid'; error: string }
  | { mode: 'results'; args: SearchArgs; hint: string | null };

/**
 * What the screen shows for the filters: the browse feed (nothing typed or picked), a validation
 * message, or search results with the `discover_search` arguments.
 */
export function searchState(f: Filters): SearchState {
  const q = f.query.trim().replace(/\s+/g, ' ');
  if (q.length > MAX_QUERY) {
    return { mode: 'invalid', error: `Keep it to ${MAX_QUERY} characters. You have ${q.length}.` };
  }
  if (!q && !f.sportId && (!f.when || f.when === 'any') && f.kind === 'everything') return { mode: 'browse' };
  const args: SearchArgs = {};
  if (q) args.p_query = q;
  if (f.sportId) args.p_sport_id = f.sportId;
  if (f.when && f.when !== 'any') args.p_when = f.when;
  let hint: string | null = null;
  if (f.kind === 'people' || f.kind === 'everything') {
    if (!q && f.kind === 'people') hint = "Type a name. Search finds people you've played with.";
    else if (q.length > 0 && q.length < PEOPLE_MIN_QUERY) hint = 'People show from 2 letters.';
  }
  return { mode: 'results', args, hint };
}

export type Grouped = { plans: SearchRow[]; places: SearchRow[]; people: SearchRow[] };

/** Results grouped into plans, places and people, keeping the server order; the kind chip filters. */
export function groupResults(rows: readonly SearchRow[], kind: KindFilter): Grouped {
  const pick = (k: string, on: boolean) => (on ? rows.filter((r) => r.kind === k) : []);
  return {
    plans: pick('plan', kind === 'everything' || kind === 'plans'),
    places: pick('place', kind === 'everything' || kind === 'places'),
    people: pick('person', kind === 'everything' || kind === 'people'),
  };
}

export function groupedCount(g: Grouped): number {
  return g.plans.length + g.places.length + g.people.length;
}

/** "3 results for “jeanne”" / "No results for “xyz” tonight." */
export function resultsSummary(count: number, args: SearchArgs, labels: { sport?: string | null; when?: string | null }): string {
  const parts = [
    args.p_query ? `for “${args.p_query}”` : null,
    labels.sport ? `in ${labels.sport.toLowerCase()}` : null,
    labels.when ? labels.when.toLowerCase() : null,
  ].filter(Boolean);
  const tail = parts.length ? ` ${parts.join(' ')}` : '';
  if (count === 0) return `Nothing${tail}.`;
  return `${count} ${count === 1 ? 'result' : 'results'}${tail}.`;
}

/* ---------- Strips ---------- */

export type StripStatus = 'forming' | 'confirmed' | 'live' | 'full';

/** The ActivityStrip status for a plan status: forming (count), GAME ON, LIVE, FULL. */
export function stripStatus(status: string | null, count: number | null, capacity: number | null): StripStatus {
  if (status === 'live') return 'live';
  if (status === 'game_on') return 'confirmed';
  if (count !== null && capacity !== null && count >= capacity) return 'full';
  return 'forming';
}

/** A title from the data, else the sport ("Pickup football" isn't ours to invent). */
export function itemTitle(title: string | null, sportName: string | null): string {
  return title?.trim() || sportName || 'A game';
}

const TIME_REASON = /^(starts in|on now|started|starts at)/i;

export type Route = { to: 'plan' | 'activity'; id: string };

export type NowStrip = {
  key: string;
  activity: string;
  time: string;
  place: string;
  status: StripStatus;
  count: number;
  capacity: number;
  route: Route;
  /** What opening it leads to, for analytics and the screen reader. */
  action: 'join' | 'waitlist' | 'watch';
};

/**
 * An Ojoro Now row as an ActivityStrip: NOW for live, else the start time; the place, then the
 * plain reasons (the time is already in the time column, so its reason is dropped).
 */
export function nowStrip(item: NowItem): NowStrip {
  const tz = item.place_time_zone ?? DEFAULT_TIME_ZONE;
  const reasons = (item.reasons ?? [])
    .filter((r) => !TIME_REASON.test(r))
    .map((r) => r.replace(/^(\d+) (people|person) you've played with$/, "$1 you've played with"));
  if (reasons.length === 0 && item.distance_km !== null) reasons.push(`${item.distance_km} km`);
  const action = item.action === 'waitlist' || item.action === 'watch' ? item.action : 'join';
  const route: Route =
    item.kind === 'activity' && item.activity_id ? { to: 'activity', id: item.activity_id } : { to: 'plan', id: item.plan_id };
  return {
    key: `${item.kind}-${item.activity_id ?? item.plan_id}`,
    activity: itemTitle(item.title, item.sport_name),
    time: item.status === 'live' ? 'NOW' : clock(item.starts_at, tz),
    place: [item.place_name ?? 'Place to be agreed', ...reasons].join(' · '),
    status: stripStatus(item.status, item.member_count, item.capacity),
    count: item.member_count,
    capacity: item.capacity,
    route,
    action,
  };
}

/** A plan search result as an ActivityStrip: the time, then the day, place and distance. */
export function resultStrip(row: SearchRow, now: Date, timeZone: string = DEFAULT_TIME_ZONE): NowStrip {
  const live = row.effective_status === 'live';
  const startsAt = row.starts_at ?? now.toISOString();
  const day = live ? 'On now' : dayLabel(startsAt, now, timeZone);
  const place = [day, row.place_name ?? 'Place to be agreed', row.distance_km !== null ? `${row.distance_km} km` : null]
    .filter(Boolean)
    .join(' · ');
  return {
    key: `plan-${row.id}`,
    activity: itemTitle(row.title, row.sport_name),
    time: live ? 'NOW' : clock(startsAt, timeZone),
    place,
    status: stripStatus(row.effective_status, row.member_count, row.capacity),
    count: row.member_count ?? 0,
    capacity: row.capacity ?? 0,
    route: { to: 'plan', id: row.id },
    action: row.effective_status === 'live' ? 'watch' : 'join',
  };
}

/* ---------- Ojoro Now headline ---------- */

/**
 * "3 things start soon. 4 people you've played with are usually free about now." Counts only. The
 * design's "4 of your friends are free until 9" needs Friends (M1) and an end time we don't have.
 */
export function nowSummary(count: number, friendsFree: number | null): string {
  const lead =
    count === 0
      ? 'Nothing starts within the hour near you.'
      : `${count} ${count === 1 ? 'thing starts' : 'things start'} soon.`;
  if (!friendsFree || friendsFree <= 0) return lead;
  const who = friendsFree === 1 ? "1 person you've played with is" : `${friendsFree} people you've played with are`;
  return `${lead} ${who} usually free about now.`;
}

/* ---------- Latent demand ---------- */

/**
 * The bucket to show: the soonest in a sport with nothing on in Ojoro Now ("NOTHING ON FOR …"),
 * else the soonest. Buckets below k never reach the app.
 */
export function pickDemand(
  buckets: readonly DemandBucket[],
  nowItems: readonly Pick<NowItem, 'sport_id'>[],
): { bucket: DemandBucket; nothingOn: boolean } | null {
  const on = new Set(nowItems.map((i) => i.sport_id));
  const sorted = [...buckets]
    .filter((b) => b.people_count > 0)
    .sort((a, b) => Date.parse(a.suggested_start) - Date.parse(b.suggested_start));
  const free = sorted.find((b) => !on.has(b.sport_id));
  if (free) return { bucket: free, nothingOn: true };
  const first = sorted[0];
  return first ? { bucket: first, nothingOn: false } : null;
}

/** "after 7", "after 7:30", "tomorrow after 7", "Sat after 7". */
export function afterWhen(at: string, now: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  const { hour, minute } = zonedParts(at, timeZone);
  const h = hour % 12 === 0 ? 12 : hour % 12;
  const time = minute === 0 ? `${h}` : `${h}:${String(minute).padStart(2, '0')}`;
  const diff = dayDiff(at, now, timeZone);
  if (diff <= 0) return `after ${time}`;
  if (diff === 1) return `tomorrow after ${time}`;
  return `${zonedParts(at, timeZone).weekday} after ${time}`;
}

/**
 * The latent demand panel's words. A count, an area radius and a time; never names or places.
 * "5 people within 3 km want to play volleyball after 7. That's a game."
 */
export function demandCopy(
  pick: { bucket: DemandBucket; nothingOn: boolean },
  radiusKm: number | null,
  now: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): { overline: string; headline: string } {
  const { bucket, nothingOn } = pick;
  const n = bucket.people_count;
  const who = n === 1 ? '1 person' : `${n} people`;
  const where = radiusKm ? ` within ${radiusKm} km` : ' near you';
  const verb = n === 1 ? 'wants' : 'want';
  const sport = bucket.sport_name.toLowerCase();
  return {
    overline: nothingOn ? `NOTHING ON FOR ${bucket.sport_name.toUpperCase()}` : `MORE ${bucket.sport_name.toUpperCase()} WANTED`,
    headline: `${who}${where} ${verb} to play ${sport} ${afterWhen(bucket.suggested_start, now, timeZone)}. That's a game.`,
  };
}

/* ---------- Surprise Me ---------- */

/** The suggestion panel: what, when, where, and "Why: …" from the server's reason. */
export function suggestionCopy(
  s: SuggestionRow,
  now: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): { title: string; body: string; why: string | null; action: 'open' | 'demand' } {
  const name = itemTitle(s.title, s.sport_name);
  const when = `${dayLabel(s.starts_at, now, timeZone)} ${clockWithPeriod(s.starts_at, timeZone)}`;
  const facts = [when];
  if (s.kind === 'demand') {
    if (s.demand_count) facts.push(`${s.demand_count} people want to play`);
  } else {
    if (s.place_name) facts.push(s.place_name);
    if (s.distance_km !== null) facts.push(`${s.distance_km} km`);
    if (s.member_count !== null && s.capacity !== null) facts.push(`${s.member_count} of ${s.capacity} in`);
  }
  const reason = s.reason?.trim();
  return {
    title: name,
    body: facts.join(' · '),
    why: reason ? `Why: ${reason.charAt(0).toUpperCase()}${reason.slice(1)}.` : null,
    action: s.kind === 'demand' ? 'demand' : 'open',
  };
}

/* ---------- People and places ---------- */

/** "Plateau, Montréal" → "Plateau": the card shows the neighbourhood. */
export function shortArea(area: string | null | undefined): string | undefined {
  const first = area?.split(',')[0]?.trim();
  return first ? first : undefined;
}

export type PersonCard = {
  key: string;
  name: string;
  handle: string;
  area: string | undefined;
  sports: string[];
  stats: { value: string; label: string }[];
  reason: string | null;
};

/** UserMiniCard props from people_to_move_with. Hidden parts stay hidden; Crews isn't shown (M7). */
export function personCard(p: Person): PersonCard {
  const stats: { value: string; label: string }[] = [];
  if (p.sessions !== null) stats.push({ value: String(p.sessions), label: p.sessions === 1 ? 'Session' : 'Sessions' });
  if (p.games_with_me) stats.push({ value: String(p.games_with_me), label: 'Games with you' });
  return {
    key: p.user_id,
    name: p.display_name,
    handle: p.handle,
    area: shortArea(p.area),
    sports: p.sports ?? [],
    stats,
    reason: p.reason?.trim() || null,
  };
}

export type PlaceCard = {
  key: string;
  name: string;
  kind: string;
  surface: string | undefined;
  distance: string | undefined;
  lights: string | undefined;
  plansTonight: number;
};

/** PlaceMiniCard props: what it's for (the first sport), surface, distance, lights, tonight's count. */
export function placeCard(p: NearbyPlace, sportName: (id: string) => string): PlaceCard {
  const first = p.sport_ids?.[0];
  const kind = first ? sportName(first) : (shortArea(p.area) ?? 'Place');
  return {
    key: p.place_id,
    name: p.name,
    kind,
    surface: p.surface ?? undefined,
    distance: p.distance_km !== null ? `${p.distance_km} km` : undefined,
    lights: floodlitLabel(p.floodlit_until) ?? undefined,
    plansTonight: p.plans_tonight ?? 0,
  };
}

/** A place search result: its area and distance (search rows carry no sports or surface). */
export function placeResultCard(row: SearchRow): PlaceCard {
  return {
    key: row.id,
    name: row.title ?? row.place_name ?? 'Place',
    kind: row.place_area ?? 'Place',
    surface: undefined,
    distance: row.distance_km !== null ? `${row.distance_km} km` : undefined,
    lights: undefined,
    plansTonight: row.plans_tonight ?? 0,
  };
}

/** "6 games with you" under a person result. */
export function personResultLine(row: SearchRow): string {
  const n = row.games_with_me ?? 0;
  const handle = row.handle ? `@${row.handle}` : null;
  const games = n > 0 ? `${n} ${n === 1 ? 'game' : 'games'} with you` : null;
  return [handle, games].filter(Boolean).join(' · ');
}

/* ---------- Area ---------- */

/** No area: home_density says so, or a call answered area_required. */
export function needsArea(hasArea: boolean | null | undefined, errorCode?: string | null): boolean {
  return hasArea === false || errorCode === 'area_required';
}

/* ---------- Offline ---------- */

/** The offline line for search results: "Results as of 7:02 PM." or why there are none. */
export function offlineResultsLine(at: Date | null, hasResults: boolean): string {
  if (!hasResults || !at) return "You're offline. Search needs a connection; we'll run it when you're back.";
  const h = at.getHours();
  const time = `${h % 12 === 0 ? 12 : h % 12}:${String(at.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  return `You're offline. These results are from ${time}.`;
}
