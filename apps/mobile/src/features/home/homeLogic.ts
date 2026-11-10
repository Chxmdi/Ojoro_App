/**
 * Home (Main.png, Slice 01 parts): the Ojoro Daily headline, the Down For to show, plans forming
 * near you, your plans and your last recap. Pure rules, no React Native.
 */
import { eventStrip, type EventRowFacts, type StripModel } from '../challenges/logic';
import { clock, dayDiff, DEFAULT_TIME_ZONE, dayLabel, zonedParts } from '../plans/time';

export type NearbyDown = {
  signal_id: string;
  sport_id: string;
  user_id: string;
  display_name: string;
  avatar_path: string | null;
  window_start: string;
  window_end: string;
  expires_at: string;
};

export type NearbyPlan = {
  plan_id: string;
  sport_id: string;
  sport_name: string;
  title: string | null;
  starts_at: string;
  capacity: number;
  member_count: number;
  effective_status: string;
  place_name: string | null;
  i_am_in: boolean;
  distance_km: number | null;
};

export type DownForPick = {
  sportId: string;
  /** Everyone down for it near you (people, not signals). */
  people: { id: string; name: string }[];
  /** When the people down stop being down (the latest window end). */
  latestEnd: string;
  /** The earliest window start, for the "tonight"/"tomorrow" word. */
  earliestStart: string;
};

/**
 * The Down For to show: the sport most people near you are down for (ties: the one with a forming
 * plan, then alphabetical so the feed is stable).
 */
export function pickDownFor(
  downs: readonly NearbyDown[],
  plans: readonly NearbyPlan[],
): DownForPick | null {
  const bySport = new Map<string, NearbyDown[]>();
  for (const d of downs) bySport.set(d.sport_id, [...(bySport.get(d.sport_id) ?? []), d]);
  const ranked = [...bySport.entries()]
    .map(([sportId, rows]) => {
      const people = new Map<string, string>();
      for (const r of rows) people.set(r.user_id, r.display_name);
      return { sportId, rows, people };
    })
    .sort(
      (a, b) =>
        b.people.size - a.people.size ||
        Number(plans.some((p) => p.sport_id === b.sportId)) - Number(plans.some((p) => p.sport_id === a.sportId)) ||
        a.sportId.localeCompare(b.sportId),
    );
  const top = ranked[0];
  if (!top) return null;
  return {
    sportId: top.sportId,
    people: [...top.people.entries()].map(([id, name]) => ({ id, name })),
    latestEnd: top.rows.reduce((m, r) => (r.window_end > m ? r.window_end : m), top.rows[0]!.window_end),
    earliestStart: top.rows.reduce((m, r) => (r.window_start < m ? r.window_start : m), top.rows[0]!.window_start),
  };
}

/** Distinct people down for anything near you ("11 people near you want to play"). */
export function peopleDown(downs: readonly NearbyDown[]): number {
  return new Set(downs.map((d) => d.user_id)).size;
}

/** The forming plan that goes with a Down For: same sport, soonest, fullest. */
export function planForSport(plans: readonly NearbyPlan[], sportId: string): NearbyPlan | null {
  const same = plans
    .filter((p) => p.sport_id === sportId && p.effective_status === 'forming')
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at) || b.member_count - a.member_count);
  return same[0] ?? null;
}

/** "TONIGHT." in the afternoon and evening, "TODAY." in the morning. */
export function dailyHeadline(now: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  return zonedParts(now, timeZone).hour < 12 ? 'TODAY.' : 'TONIGHT.';
}

/** The best move: a forming plan you can still join today, fullest first, then soonest. */
export function bestMove(plans: readonly NearbyPlan[], now: Date, timeZone: string = DEFAULT_TIME_ZONE): NearbyPlan | null {
  const today = plans
    .filter((p) => p.effective_status === 'forming' && dayDiff(p.starts_at, now, timeZone) === 0)
    .sort(
      (a, b) =>
        b.member_count / b.capacity - a.member_count / a.capacity ||
        Date.parse(a.starts_at) - Date.parse(b.starts_at),
    );
  return today[0] ?? null;
}

/** The sentence under TONIGHT. */
export function dailyBody(input: {
  downCount: number;
  best: NearbyPlan | null;
  timeZone?: string;
}): string {
  const { downCount, best } = input;
  const tz = input.timeZone ?? DEFAULT_TIME_ZONE;
  const want =
    downCount === 0
      ? ''
      : `${downCount} ${downCount === 1 ? 'person' : 'people'} near you ${downCount === 1 ? 'wants' : 'want'} to play. `;
  if (best) {
    const at = best.place_name ? ` at ${best.place_name}` : '';
    const lead = best.i_am_in ? "You're in" : 'Your best move:';
    return `${want}${lead} ${best.sport_name.toLowerCase()}${at}, ${clock(best.starts_at, tz)}.`;
  }
  if (downCount > 0) return `${want}Say you're down and Ojoro gathers people around it.`;
  return "Nothing's forming near you yet. Say what you're down for and Ojoro gathers people around it.";
}

/** DownFor's `when` word: "tonight", "today", "tomorrow", "sat". */
export function downForWhen(earliestStart: string, now: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  const start = Math.max(Date.parse(earliestStart), now.getTime());
  return dayLabel(start, now, timeZone).toLowerCase();
}

/** DownFor's body line: an area and a rough time, never an address. */
export function downForWhere(
  plan: NearbyPlan | null,
  latestEnd: string,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  if (plan) {
    const parts = [plan.place_name ?? 'Place to be agreed', `around ${clock(plan.starts_at, timeZone)}`];
    if (plan.distance_km !== null) parts.push(`${plan.distance_km} km`);
    return parts.join(' · ');
  }
  return `Near you · until ${clock(latestEnd, timeZone)}`;
}

/** The link under DownFor when a plan for it is already forming. */
export function formingLink(plan: NearbyPlan): string {
  return `${plan.member_count} of ${plan.capacity} are already in a plan.`;
}

/* ---------- Recap block ---------- */

export type RecapFacts = {
  occurred_at: string;
  duration_minutes: number;
  played_count: number;
  moments_count: number;
  team_a_label: string | null;
  team_b_label: string | null;
  team_a_score: number | null;
  team_b_score: number | null;
};

/** Show the last recap for a week. */
export const RECAP_FRESH_DAYS = 7;

export function recapIsRecent(occurredAt: string, now: Date, timeZone: string = DEFAULT_TIME_ZONE): boolean {
  const diff = -dayDiff(occurredAt, now, timeZone);
  return diff >= 0 && diff <= RECAP_FRESH_DAYS;
}

/** "LIGHTS WIN 5–4.", "4–4. A DRAW.", or the count when nothing was logged ("8 PLAYED."). */
export function recapHeadline(r: RecapFacts): string {
  if (r.team_a_score === null || r.team_b_score === null) return `${r.played_count} PLAYED.`;
  const a = r.team_a_score;
  const b = r.team_b_score;
  if (a === b) return `${a}–${b}. A DRAW.`;
  const winner = a > b ? r.team_a_label : r.team_b_label;
  const score = `${Math.max(a, b)}–${Math.min(a, b)}`;
  return winner ? `${winner.toUpperCase()} WIN ${score}.` : `${score}.`;
}

/** "8 played · 90 min · 3 photos added." */
export function recapLine(r: RecapFacts): string {
  const parts = [`${r.played_count} played`, `${r.duration_minutes} min`];
  if (r.moments_count > 0) parts.push(`${r.moments_count} ${r.moments_count === 1 ? 'photo' : 'photos'} added`);
  return `${parts.join(' · ')}.`;
}

/** The divider over the recap: "TODAY", "YESTERDAY", "LAST THURSDAY". */
export function recapWhen(occurredAt: string, now: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  const diff = -dayDiff(occurredAt, now, timeZone);
  if (diff <= 0) return 'EARLIER TODAY';
  if (diff === 1) return 'YESTERDAY';
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(new Date(occurredAt));
  return `LAST ${weekday.toUpperCase()}`;
}

/* ---------- Your plans ---------- */

/** Plans near you that you aren't in (yours show under YOUR PLANS). */
export function formingNearYou(plans: readonly NearbyPlan[], mine: ReadonlySet<string>): NearbyPlan[] {
  return plans.filter((p) => !p.i_am_in && !mine.has(p.plan_id) && p.effective_status === 'forming');
}

/* ---------- Step 4: the action feed (home_feed) ---------- */

/** The fields of a `home_feed()` card these rules read (nullable columns as the contract marks them). */
export type FeedCard = {
  position: number;
  card: string;
  action: string;
  object_kind: string | null;
  object_id: string | null;
  plan_id: string | null;
  activity_id: string | null;
  crew_id: string | null;
  sport_id: string | null;
  sport_name: string | null;
  title: string;
  reason: string | null;
  starts_at: string | null;
  place_name: string | null;
  member_count: number | null;
  capacity: number | null;
  people: number | null;
  notification_id: string | null;
  href: string | null;
  /** Polish (GAPS-FEED): challenge_event cards only (older servers leave these out). */
  stage?: string | null;
  /** The object's situation where it has one: forming / confirmed / live / after. */
  situation?: string | null;
  /** challenge_event cards: the facts the strip draws (my_challenge_events' columns). */
  event?: unknown;
};

export type FeedSection = { kind: string; cards: FeedCard[] };

/**
 * The feed in rank order, consecutive cards of one kind under one heading, and the closing card.
 * `caught_up` is always the end (the server sends it last); without one, the client says it.
 */
export function feedSections(cards: readonly FeedCard[]): { sections: FeedSection[]; end: FeedCard | null } {
  const sorted = [...cards].sort((a, b) => a.position - b.position);
  const sections: FeedSection[] = [];
  let end: FeedCard | null = null;
  for (const c of sorted) {
    if (c.card === 'caught_up') {
      end = c;
      continue;
    }
    const last = sections[sections.length - 1];
    // One heading per run: crew suggestions and crew plans share YOUR CREWS.
    if (last && sectionKey(last.kind) === sectionKey(c.card)) last.cards.push(c);
    else sections.push({ kind: c.card, cards: [c] });
  }
  return { sections, end };
}

function sectionKey(kind: string): string {
  return sectionLabel(kind) ?? kind;
}

/** The divider over a section. Down For draws its own overline; the recap's says when. */
export function sectionLabel(kind: string): string | null {
  switch (kind) {
    case 'needs_you':
      return 'NEEDS YOU';
    case 'your_plan':
      return 'YOUR PLANS';
    case 'crew_suggestion':
    case 'crew_plan':
      return 'YOUR CREWS';
    case 'plan_forming':
      return 'FORMING NEAR YOU';
    case 'challenge_event':
      return 'CHALLENGES';
    default:
      return null;
  }
}

/** A plan card as the forming-plan object reads it. */
export function cardToNearby(c: FeedCard): NearbyPlan | null {
  if (!c.plan_id || c.capacity === null || c.member_count === null || !c.starts_at) return null;
  return {
    plan_id: c.plan_id,
    sport_id: c.sport_id ?? '',
    sport_name: c.sport_name ?? c.title,
    title: c.title,
    starts_at: c.starts_at,
    capacity: c.capacity,
    member_count: c.member_count,
    effective_status: 'forming',
    place_name: c.place_name,
    i_am_in: false,
    distance_km: null,
  };
}

/** A your_plan card that is live now opens the live screen (the server's href says so). */
export function isLiveCard(c: Pick<FeedCard, 'href'>): boolean {
  return /\/activity\/[^/]+\/live$/.test(c.href ?? '');
}

/**
 * The Down For to show, reconciled with the feed: the sport the server ranked (its `down_for`
 * card), drawn from the people down near you for that sport. When the feed has none because you're
 * already down, your own sport stays (committed), so the tap you just made doesn't vanish.
 */
export function feedDownFor(
  card: Pick<FeedCard, 'sport_id'> | null,
  committedSportId: string | null,
  downs: readonly NearbyDown[],
  plans: readonly NearbyPlan[],
): DownForPick | null {
  const sportId = card?.sport_id ?? committedSportId;
  if (!sportId) return null;
  return pickDownFor(
    downs.filter((d) => d.sport_id === sportId),
    plans,
  );
}

/** "3 of you want in" → the crew suggestion's line; falls back to the count. */
export function crewSuggestionLine(c: Pick<FeedCard, 'reason' | 'people'>): string {
  if (c.reason) return `${c.reason.charAt(0).toUpperCase()}${c.reason.slice(1)}.`.replace(/\.\.$/, '.');
  return c.people ? `${c.people} of you want in.` : 'Your crew is talking about a game.';
}

/* ---------- Polish (GAPS-FEED): Challenge Events on Main ---------- */

/** Why a Challenge Event is on your Main (home_feed `event.relation`). */
export type ChallengeRelation = 'competitor' | 'organizer' | 'your_crew' | 'following' | 'rival' | 'crew' | 'clan';

export type FeedChallenge = EventRowFacts & { relation: ChallengeRelation | string };

const SITUATIONS = ['calm', 'forming', 'confirmed', 'live', 'after'] as const;
export type FeedSituation = (typeof SITUATIONS)[number];

/** The situation a card's object sits in, when the server gave one we know. */
export function cardSituation(c: Pick<FeedCard, 'situation'>): FeedSituation | null {
  return (SITUATIONS as readonly string[]).includes(c.situation ?? '') ? (c.situation as FeedSituation) : null;
}

/**
 * The ground a challenge strip sits on (owner decision): accepted and build-up strips on calm ground,
 * as Main.png draws them; the stages Main.png doesn't show keep their own situation (event day and
 * almost time confirmed, live, after) on the strip's root.
 */
export function challengeStripSituation(c: Pick<FeedCard, 'situation' | 'stage'>): FeedSituation {
  if (c.stage === 'accepted' || c.stage === 'days') return 'calm';
  return cardSituation(c) ?? 'calm';
}

/** The event facts of a challenge_event card, or null when they're missing or malformed. */
export function feedChallenge(c: Pick<FeedCard, 'card' | 'event'>): FeedChallenge | null {
  if (c.card !== 'challenge_event' || !c.event || typeof c.event !== 'object') return null;
  const e = c.event as Partial<FeedChallenge>;
  if (!e.event_id || !e.stage || !e.title || !e.starts_at || !e.a_name || !e.b_name) return null;
  return {
    event_id: e.event_id,
    stage: e.stage,
    relation: e.relation ?? 'following',
    format: e.format ?? 'person_vs_person',
    title: e.title,
    starts_at: e.starts_at,
    time_zone: e.time_zone ?? null,
    a_name: e.a_name,
    b_name: e.b_name,
    side_size: e.side_size ?? null,
    follower_count: e.follower_count ?? null,
    live_period: e.live_period ?? null,
    scoring: e.scoring ?? 'time',
    target: e.target ?? null,
    winner_side: e.winner_side ?? null,
    my_side: e.my_side ?? null,
  };
}

/** Words for why it's here; competitors and followers need none beyond Compete's own ("You follow"). */
const RELATION_WORDS: Record<string, string> = {
  organizer: "You're organizing",
  your_crew: 'Your crew',
  rival: 'Your rival',
  crew: 'From your crew',
  clan: 'From your clan',
};

/**
 * The strip for a challenge_event card: Compete's YOUR EVENTS row ("Chimdi vs Marcus · 5K",
 * "142 following · build-up", 3 DAYS), with why it's on your Main first when it isn't yours.
 */
export function challengeCardModel(c: Pick<FeedCard, 'card' | 'event'>, now: number): StripModel | null {
  const facts = feedChallenge(c);
  if (!facts) return null;
  const model = eventStrip(facts, now);
  const why = RELATION_WORDS[facts.relation];
  return why ? { ...model, meta: model.meta ? `${why} · ${model.meta}` : why } : model;
}

/** The divider: the design's CHALLENGES YOU FOLLOW when every one is followed, else CHALLENGES. */
export function challengeSectionLabel(cards: readonly Pick<FeedCard, 'card' | 'event'>[]): string {
  const rows = cards.map(feedChallenge);
  return rows.length > 0 && rows.every((r) => r?.relation === 'following') ? 'CHALLENGES YOU FOLLOW' : 'CHALLENGES';
}
