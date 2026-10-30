/**
 * Pure copy and rules for Crew Home (design-handoff/screens/CrewHome.png; docs/COMMUNITIES_CONTRACT.md,
 * Crew Home). Everything is built from the server's facts in the crew's time zone. Availability is
 * overlap only: a count and first names, never a slot or a calendar. No React Native imports.
 */
import { clock, clockWithPeriod, dayDiff, zonedParts } from '../plans/time';

const WEEKDAYS_LONG: Record<string, string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday',
};
/** ISO day of week (1 = Monday) to its name. */
const ISO_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** "Ade" from "Ade B". */
export function firstName(name: string | null | undefined): string {
  const first = (name ?? '').trim().split(/\s+/)[0];
  return first && first.length > 0 ? first : 'Someone';
}

/** "football" / "ultimate_frisbee" → "Football" / "Ultimate frisbee". */
export function sportWord(sportId: string | null | undefined): string {
  if (!sportId) return 'A game';
  const words = sportId.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "Ade", "Ade and Lena", "Ade, Lena, Joel and Sam". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export const FREE_NAMES_MAX = 4;

/**
 * FREE TONIGHT's sentence. Names first (up to four), then how many more, never when or why:
 * "Ade, Lena, Joel and Sam are free this evening." Null when nobody is.
 */
export function freeTonightLine(names: readonly string[], count: number): string | null {
  const total = Math.max(count, names.length);
  if (total <= 0) return null;
  const shown = names.slice(0, FREE_NAMES_MAX).map(firstName);
  const more = total - shown.length;
  if (shown.length === 0) {
    return `${total} ${total === 1 ? 'crew mate is' : 'crew mates are'} free this evening.`;
  }
  const list = more > 0 ? `${shown.join(', ')} and ${more} more` : joinNames(shown);
  return `${list} ${total === 1 ? 'is' : 'are'} free this evening.`;
}

function partOfDay(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

/** "tonight", "tomorrow morning", "Saturday morning", "Sat 8 Nov evening". */
export function windowWords(start: string, now: Date, timeZone: string): string {
  const diff = dayDiff(start, now, timeZone);
  const p = zonedParts(start, timeZone);
  const part = partOfDay(p.hour);
  if (diff <= 0) return part === 'evening' ? 'tonight' : `this ${part}`;
  if (diff === 1) return `tomorrow ${part}`;
  if (diff < 7) return `${WEEKDAYS_LONG[p.weekday] ?? p.weekday} ${part}`;
  return `${p.weekday} ${p.day} ${p.monthName}, ${part}`;
}

/** "Fri 10 PM", "tonight 11 PM", "tomorrow 9 AM". */
export function endsWords(at: string, now: Date, timeZone: string): string {
  const diff = dayDiff(at, now, timeZone);
  const time = clockWithPeriod(at, timeZone);
  if (diff <= 0) return `${zonedParts(at, timeZone).hour >= 17 ? 'tonight' : 'today'} ${time}`;
  if (diff === 1) return `tomorrow ${time}`;
  return `${zonedParts(at, timeZone).weekday} ${time}`;
}

export type DownForFacts = {
  display_name: string;
  sport_id: string;
  sport_name: string | null;
  window_start: string;
  expires_at: string;
  down_count: number;
  i_am_down: boolean;
  is_mine: boolean;
};

/** "Football, Saturday morning". */
export function downForTitle(row: DownForFacts, now: Date, timeZone: string): string {
  const sport = row.sport_name ?? sportWord(row.sport_id);
  return `${sport}, ${windowWords(row.window_start, now, timeZone)}`;
}

/** "Lena · 3 down · ends Fri 10 PM" ("You" for your own). */
export function downForMeta(row: DownForFacts, now: Date, timeZone: string): string {
  const who = row.is_mine ? 'You' : firstName(row.display_name);
  return `${who} · ${row.down_count} down · ends ${endsWords(row.expires_at, now, timeZone)}`;
}

/** I'M DOWN shows unless it's yours or you're already in. */
export function canJoinDownFor(row: Pick<DownForFacts, 'i_am_down' | 'is_mine'>): boolean {
  return !row.i_am_down && !row.is_mine;
}

/** The day word for a time: Tonight / Today / Tomorrow / Thu / Thu 6 Nov. */
function shortDay(at: string, now: Date, timeZone: string): string {
  const diff = dayDiff(at, now, timeZone);
  const p = zonedParts(at, timeZone);
  if (diff === 0) return p.hour >= 17 ? 'Tonight' : 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff > 1 && diff < 7) return p.weekday;
  return `${p.weekday} ${p.day} ${p.monthName}`;
}

export type NextFacts = {
  next_plan_id: string | null;
  next_title: string | null;
  next_sport_id: string | null;
  next_starts_at: string | null;
  next_place_name: string | null;
};

/** CrewMomentum's NEXT: "Football · Thu 7:30 · Jeanne-Mance". Null when nothing is next. */
export function nextLine(home: NextFacts, now: Date, timeZone: string): string | null {
  if (!home.next_plan_id || !home.next_starts_at) return null;
  const what = home.next_title?.trim() || sportWord(home.next_sport_id);
  const when = `${shortDay(home.next_starts_at, now, timeZone)} ${clock(home.next_starts_at, timeZone)}`;
  return [what, when, home.next_place_name].filter(Boolean).join(' · ');
}

/** "19:30:00" → "7:30" (the designs drop the period next to a day name). */
export function localClock(time: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return time;
  const h = Number(m[1]) % 24;
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]}`;
}

export function isoDayName(day: number): string {
  return ISO_DAYS[(day - 1 + 7) % 7] ?? 'Week';
}

export type RitualFacts = {
  title: string;
  day_of_week: number;
  local_time: string;
  place_name: string | null;
  status: 'active' | 'paused' | 'ended';
  lead_days: number;
  week_starts_at: string;
  week_skipped: boolean;
  week_plan_id: string | null;
  week_member_count: number | null;
  week_capacity: number | null;
  can_edit: boolean;
  host_id: string;
};

/** "THURSDAY FOOTBALL." */
export function ritualHeadline(r: Pick<RitualFacts, 'title'>): string {
  const t = r.title.trim().toUpperCase();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/** "Every Thursday, 7:30, Jeanne-Mance. Prefilled each week; everyone still taps I'M DOWN." */
export function ritualLine(r: Pick<RitualFacts, 'day_of_week' | 'local_time' | 'place_name' | 'status'>): string {
  const when = [`Every ${isoDayName(r.day_of_week)}`, localClock(r.local_time), r.place_name].filter(Boolean).join(', ');
  if (r.status === 'paused') return `${when}. Paused: nothing goes on the board until it's back on.`;
  return `${when}. Prefilled each week; everyone still taps I'M DOWN.`;
}

export type RitualWeek =
  | { kind: 'plan'; label: string; planId: string }
  | { kind: 'skipped'; label: string }
  | { kind: 'later'; label: string }
  | { kind: 'paused' };

/** THIS WEEK · 6 / 10 (opens the plan), skipped, or when the week goes on the board. */
export function ritualWeek(r: RitualFacts, timeZone: string): RitualWeek {
  if (r.status === 'paused') return { kind: 'paused' };
  if (r.week_skipped) return { kind: 'skipped', label: `Skipped ${weekDate(r.week_starts_at, timeZone)}. The week after is on.` };
  if (r.week_plan_id) {
    const n = r.week_member_count ?? 0;
    const cap = r.week_capacity;
    return { kind: 'plan', planId: r.week_plan_id, label: cap ? `THIS WEEK · ${n} / ${cap}` : `THIS WEEK · ${n} IN` };
  }
  const opens = new Date(Date.parse(r.week_starts_at) - r.lead_days * 86_400_000);
  return { kind: 'later', label: `On the board from ${weekDate(opens.toISOString(), timeZone)}.` };
}

/** "Thu 6 Nov". */
export function weekDate(at: string, timeZone: string): string {
  const p = zonedParts(at, timeZone);
  return `${p.weekday} ${p.day} ${p.monthName}`;
}

/** SKIP A WEEK is for the Ritual's editors and its host, while the week isn't skipped or paused. */
export function canSkipWeek(r: RitualFacts, myId: string | null | undefined): boolean {
  if (r.status !== 'active' || r.week_skipped) return false;
  return r.can_edit || (!!myId && r.host_id === myId);
}

export type SuggestFacts = {
  suggest_sport_id: string | null;
  suggest_day_of_week: number | null;
  suggest_local_time: string | null;
  suggest_place_name: string | null;
  suggest_weeks: number | null;
};

/** MAKE THIS A RITUAL: "Football on Thursdays at 7:30, Jeanne-Mance: 3 of the last 5 weeks." Null without one. */
export function ritualSuggestion(h: SuggestFacts): { title: string; body: string } | null {
  if (!h.suggest_sport_id || !h.suggest_day_of_week || !h.suggest_local_time) return null;
  const day = isoDayName(h.suggest_day_of_week);
  const sport = sportWord(h.suggest_sport_id);
  const where = h.suggest_place_name ? `, ${h.suggest_place_name}` : '';
  const weeks = h.suggest_weeks ? ` ${h.suggest_weeks} of the last 5 weeks.` : '';
  return {
    title: `${day.toUpperCase()} ${sport.toUpperCase()}.`,
    body: `${sport} on ${day}s at ${localClock(h.suggest_local_time)}${where}.${weeks} Make it a Ritual and the plan goes on the board each week; everyone still taps I'M DOWN.`,
  };
}

/** The Ritual a suggestion creates: "Thursday football". */
export function suggestionTitle(h: SuggestFacts): string {
  return `${isoDayName(h.suggest_day_of_week ?? 1)} ${sportWord(h.suggest_sport_id).toLowerCase()}`.slice(0, 40);
}

export type VersusFacts = {
  opponent_name: string | null;
  side_size: number;
  starts_at: string;
  time_zone: string;
  place_name: string | null;
  stage: string;
  in_count: number;
  needed: number;
  our_value: number | null;
  their_value: number | null;
  outcome: string | null;
};

/** CREW VS CREW row: "SUN" · "vs Plateau Crew" · "5 a side · Jeanne-Mance · 9 of 10 in" · ACCEPTED. */
export function versusRow(v: VersusFacts, now: Date): { day: string; title: string; meta: string; badge: string; signal: boolean } {
  const diff = dayDiff(v.starts_at, now, v.time_zone);
  const p = zonedParts(v.starts_at, v.time_zone);
  const day = (diff >= 0 && diff < 7 ? p.weekday : `${p.day} ${p.monthName}`).toUpperCase();
  const title = `vs ${v.opponent_name ?? 'another crew'}`;
  const done = v.stage === 'complete';
  const score = done && v.our_value !== null && v.their_value !== null ? `${v.our_value}–${v.their_value}` : null;
  const meta = [`${v.side_size} a side`, v.place_name, score ?? (done ? null : `${v.in_count} of ${v.needed} in`)]
    .filter(Boolean)
    .join(' · ');
  return { day, title, meta, ...versusBadge(v.stage, v.outcome) };
}

export function versusBadge(stage: string, outcome: string | null): { badge: string; signal: boolean } {
  switch (stage) {
    case 'today':
    case 'soon':
      return { badge: 'TODAY', signal: true };
    case 'live':
      return { badge: 'LIVE', signal: true };
    case 'verifying':
      return { badge: 'VERIFYING', signal: false };
    case 'disputed':
      return { badge: 'DISPUTED', signal: false };
    case 'cancelled':
      return { badge: 'CALLED OFF', signal: false };
    case 'complete':
      if (outcome === 'won') return { badge: 'WON', signal: true };
      if (outcome === 'lost') return { badge: 'LOST', signal: false };
      return { badge: 'DRAW', signal: false };
    default:
      return { badge: 'ACCEPTED', signal: false };
  }
}

export type MemoryFacts = {
  occurred_at: string;
  sport_id: string;
  team_a_label: string | null;
  team_b_label: string | null;
  team_a_score: number | null;
  team_b_score: number | null;
  played_count: number;
};

/** "Lights win 5–4 · 6 Oct", "Draw 3–3 · 6 Oct", or "Football · 10 played · 1 Oct". */
export function memoryCaption(m: MemoryFacts, timeZone: string): string {
  const p = zonedParts(m.occurred_at, timeZone);
  const date = `${p.day} ${p.monthName}`;
  const a = m.team_a_score;
  const b = m.team_b_score;
  if (a !== null && b !== null) {
    if (a === b) return `Draw ${a}–${b} · ${date}`;
    const winner = a > b ? m.team_a_label : m.team_b_label;
    const hi = Math.max(a, b);
    const lo = Math.min(a, b);
    return winner ? `${winner} win ${hi}–${lo} · ${date}` : `${hi}–${lo} · ${date}`;
  }
  return `${sportWord(m.sport_id)} · ${m.played_count} played · ${date}`;
}

/** "OPEN CREW CHAT · 4 NEW". */
export function chatButtonLabel(unread: number): string {
  if (unread <= 0) return 'OPEN CREW CHAT';
  return `OPEN CREW CHAT · ${unread > 99 ? '99+' : unread} NEW`;
}

/** The header chat button's name: "Crew chat, 4 new". */
export function chatIconLabel(unread: number): string {
  return unread > 0 ? `Crew chat, ${unread} new` : 'Crew chat';
}

// You → "Crews, clans & hosting" -----------------------------------------------------------------

export type CommunityRow = {
  key: string;
  kind: 'crew' | 'clan' | 'host';
  /** The display-face number in the leading column. */
  count: number;
  /** What the number is, for screen readers: "14 members". */
  countLabel: string;
  title: string;
  meta: string;
  badge: string;
  href: string;
};

const CLAN_ROLE_WORDS: Record<string, string> = {
  captain: 'captain',
  organizer: 'organizer',
  coach: 'coach',
  moderator: 'moderator',
  mentor: 'mentor',
  connector: 'connector',
};

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Crews, then clans, then the host programs you run, as the You list shows them. */
export function communityRows(input: {
  crews: readonly { crew_id: string; name: string; member_count: number; role: 'owner' | 'admin' | 'member' }[];
  clans: readonly { clan_id: string; name: string; member_count: number; role: string }[];
  programs: readonly {
    id: string;
    name: string;
    role: 'owner' | 'co_host';
    upcoming_sessions: number;
    pending_requests: number;
  }[];
}): CommunityRow[] {
  const crews = input.crews.map<CommunityRow>((c) => ({
    key: `crew-${c.crew_id}`,
    kind: 'crew',
    count: c.member_count,
    countLabel: plural(c.member_count, 'member'),
    title: c.name,
    meta: ['Crew', c.role === 'owner' ? 'you own it' : c.role === 'admin' ? 'admin' : null].filter(Boolean).join(' · '),
    badge: 'CREW',
    href: `/crew/${c.crew_id}`,
  }));
  const clans = input.clans.map<CommunityRow>((c) => {
    const role = CLAN_ROLE_WORDS[c.role];
    return {
      key: `clan-${c.clan_id}`,
      kind: 'clan',
      count: c.member_count,
      countLabel: plural(c.member_count, 'member'),
      title: c.name,
      meta: role ? `Clan · ${role} role` : 'Clan',
      badge: 'CLAN',
      href: `/clan/${c.clan_id}`,
    };
  });
  const programs = input.programs.map<CommunityRow>((p) => ({
    key: `host-${p.id}`,
    kind: 'host',
    count: p.upcoming_sessions,
    countLabel: `${plural(p.upcoming_sessions, 'session')} in the next 7 days`,
    title: p.name,
    meta: [
      'Host tools',
      p.role === 'owner' ? 'you run it' : 'you co-host',
      `${plural(p.upcoming_sessions, 'session')} this week`,
      p.pending_requests > 0 ? `${plural(p.pending_requests, 'request')} waiting` : null,
    ]
      .filter(Boolean)
      .join(' · '),
    badge: p.role === 'owner' ? 'HOST' : 'CO-HOST',
    href: `/host/${p.id}`,
  }));
  return [...crews, ...clans, ...programs];
}
