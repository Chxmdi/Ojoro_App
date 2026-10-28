/**
 * Home (Main.png, Slice 01 parts): the Ojoro Daily headline, the Down For to show, plans forming
 * near you, your plans and your last recap. Pure rules, no React Native.
 */
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
  now: Date;
  timeZone?: string;
}): string {
  const { downCount, best, now } = input;
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
  now: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  if (plan) {
    const parts = [plan.place_name ?? 'Place to be agreed', `around ${clock(plan.starts_at, timeZone)}`];
    if (plan.distance_km !== null) parts.push(`${plan.distance_km} km`);
    return parts.join(' · ');
  }
  void now;
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
