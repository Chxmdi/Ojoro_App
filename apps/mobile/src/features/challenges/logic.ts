/**
 * Pure rules for Compete and the Call-Out (design-handoff/screens/Compete.png, CallOut.png; PRD
 * §9.14, §10.2): the words for a call-out's status, its rules and its reply; the Compete rows for
 * call-outs, events and rivalries; the Call-Out composer and the counter (both undesigned, kept
 * minimal; docs/DESIGN_DECISIONS.md, Step 5 screens: A). No React Native imports.
 *
 * No money anywhere: STAKES is always "None. Bragging rights only."
 */
import type {
  CallOutStatus,
  ChallengeAudience,
  ChallengeFormat,
  ChallengeScoring,
  ChallengeStage,
  RpcArgs,
} from '@ojoro/contracts';
import { CALL_OUT_MESSAGE_MAX_LENGTH } from '@ojoro/contracts';

import { DEFAULT_TIME_ZONE, dayDiff, shortClock, zonedParts, zonedTime } from '../plans/time';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Words -----------------------------------------------------------------------------------------

/** The first word of a name ("Marcus T" → "Marcus"); crews keep their whole name. */
export function shortName(name: string | null | undefined, crew = false): string {
  const n = (name ?? '').trim();
  if (n.length === 0) return 'Someone';
  if (crew) return n;
  return n.split(/\s+/)[0] ?? n;
}

/** "JUST NOW", "5 MIN AGO", "2H AGO", "3D AGO" (overlines are uppercase). */
export function ageWords(at: string, now: number): string {
  const s = Math.max(0, Math.floor((now - Date.parse(at)) / 1000));
  if (s < 60) return 'JUST NOW';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} MIN AGO`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}H AGO`;
  return `${Math.floor(h / 24)}D AGO`;
}

/** "9:00", "18:30": the designs write challenge starts on a 24-hour clock without a period. */
function clock24(hour: number, minute: number): string {
  return `${hour}:${String(minute).padStart(2, '0')}`;
}

/** "Sat 12 Oct, 9:00" (rules, Compete). */
export function startLine(at: string, timeZone: string = DEFAULT_TIME_ZONE): string {
  const p = zonedParts(at, timeZone);
  return `${p.weekday} ${p.day} ${p.monthName}, ${clock24(p.hour, p.minute)}`;
}

/** "Sat 12 Oct · 9:00" (the poster's foot). */
export function posterWhen(at: string, timeZone: string = DEFAULT_TIME_ZONE): string {
  const p = zonedParts(at, timeZone);
  return `${p.weekday} ${p.day} ${p.monthName} · ${clock24(p.hour, p.minute)}`;
}

/** "Sat 12 Oct" (a rivalry's next meeting). */
export function shortDate(at: string, timeZone: string = DEFAULT_TIME_ZONE): string {
  const p = zonedParts(at, timeZone);
  return `${p.weekday} ${p.day} ${p.monthName}`;
}

/** The badge word on the poster. Passing reads DECLINED there: the word the design system has. */
export type PosterStatus = 'PENDING' | 'ACCEPTED' | 'COUNTERED' | 'DECLINED' | 'WITHDRAWN' | 'EXPIRED';

export function posterStatus(status: CallOutStatus): PosterStatus {
  switch (status) {
    case 'accepted':
      return 'ACCEPTED';
    case 'countered':
      return 'COUNTERED';
    case 'declined':
      return 'DECLINED';
    case 'withdrawn':
      return 'WITHDRAWN';
    case 'expired':
      return 'EXPIRED';
    default:
      return 'PENDING';
  }
}

/** "5.0 km", "30 min", "3 rounds", "21 points". */
export function targetWords(target: number | null | undefined, unit: string | null | undefined): string | null {
  if (target === null || target === undefined || !(target > 0)) return null;
  if (unit === 'km') return `${target.toFixed(1)} km`;
  const n = Number.isInteger(target) ? String(target) : target.toFixed(1);
  if (!unit) return n;
  if (n === '1' && unit.endsWith('s')) return `1 ${unit.slice(0, -1)}`;
  return `${n} ${unit}`;
}

// The Call-Out screen ---------------------------------------------------------------------------

/** What the CallOut screen needs from `call_out_view`. */
export type CallOutFacts = {
  id: string;
  status: CallOutStatus;
  format: ChallengeFormat;
  sport_id?: string | undefined;
  sport_name: string | null;
  title: string;
  scoring: ChallengeScoring;
  target: number | null;
  unit: string | null;
  place_id: string | null;
  place_name: string | null;
  place_area: string | null;
  course_note: string | null;
  starts_at: string;
  time_zone: string | null;
  message: string | null;
  audience: ChallengeAudience;
  verification: 'participant_confirmation' | 'device';
  side_size: number | null;
  is_open: boolean;
  challenger_id: string;
  challenger_name: string;
  opponent_id: string | null;
  opponent_name: string | null;
  is_mine: boolean;
  can_answer: boolean;
  games_together: number | null;
  rivalry_id: string | null;
  rivalry_challenger_wins: number | null;
  rivalry_opponent_wins: number | null;
  rivalry_draws: number | null;
  countered_from: string | null;
  counter_id: string | null;
  rematch_of_event_id: string | null;
  event_id: string | null;
  expires_at: string;
  created_at: string;
};

const crew = (f: Pick<CallOutFacts, 'format'>) => f.format === 'crew_vs_crew';

/** The opponent's name, or what an open call-out is to. */
export function opponentLabel(f: Pick<CallOutFacts, 'opponent_name' | 'is_open' | 'format'>): string {
  if (f.opponent_name && f.opponent_name.trim()) return f.opponent_name.trim();
  return crew(f) ? 'Any crew' : 'Anyone';
}

/** The header overline: "RECEIVED 2H AGO", "SENT 2H AGO", or "OPEN CALL-OUT · 2H AGO". */
export function headerOverline(f: Pick<CallOutFacts, 'is_mine' | 'is_open' | 'created_at'>, now: number): string {
  const age = ageWords(f.created_at, now);
  if (f.is_mine) return `SENT ${age}`;
  if (f.is_open) return `OPEN CALL-OUT · ${age}`;
  return `RECEIVED ${age}`;
}

/** "Person vs person · run", "Crew vs crew · 5 a side · football". */
export function formatWords(f: Pick<CallOutFacts, 'format' | 'side_size' | 'sport_name'>): string {
  const sport = f.sport_name?.trim().toLowerCase();
  const parts = crew(f)
    ? ['Crew vs crew', `${f.side_size ?? 5} a side`]
    : ['Person vs person'];
  if (sport) parts.push(sport);
  return parts.join(' · ');
}

/** "Mount Royal loop, 5.0 km, from the Cartier monument" (the course line), else "Mount Royal loop, 5.0 km". Areas, never addresses. */
export function courseWords(
  f: Pick<CallOutFacts, 'place_name' | 'place_area' | 'target' | 'unit' | 'course_note'>,
): string {
  // The challenger's course line is the whole course when there is one (contract: `course_note` or
  // `place_name`); otherwise the place and the distance.
  const note = f.course_note?.trim();
  if (note) return note;
  const parts = [f.place_name?.trim(), targetWords(f.target, f.unit)].filter((p): p is string => !!p);
  if (parts.length === 0) return f.place_area ? `${f.place_area}. Agree the spot in the build-up.` : 'Agree it in the build-up.';
  return parts.join(', ');
}

export function verifiedByWords(f: Pick<CallOutFacts, 'verification' | 'format'>): string {
  const who = crew(f) ? 'both captains confirm' : 'both of you confirm';
  return f.verification === 'device' ? `GPS watch data, then ${who}` : `${who.charAt(0).toUpperCase()}${who.slice(1)} the result`;
}

export function audienceWords(f: Pick<CallOutFacts, 'audience' | 'format'>): string {
  switch (f.audience) {
    case 'friends':
      return "People you've played with. They can follow, predict and back.";
    case 'participants':
      return crew(f) ? 'Just the two crews. No crowd.' : 'Just the two of you. No crowd.';
    default:
      return 'Public. People can follow, predict and back.';
  }
}

/** THE RULES, in the design's order. STAKES never changes. */
export function ruleRows(f: CallOutFacts): { label: string; value: string }[] {
  return [
    { label: 'FORMAT', value: formatWords(f) },
    { label: 'COURSE', value: courseWords(f) },
    { label: 'START', value: startLine(f.starts_at, f.time_zone ?? DEFAULT_TIME_ZONE) },
    { label: 'VERIFIED BY', value: verifiedByWords(f) },
    { label: 'AUDIENCE', value: audienceWords(f) },
    { label: 'STAKES', value: 'None. Bragging rights only.' },
  ];
}

/** "Marcus T · 12 games together · rivalry 3–4" (the record is from the challenger's side). */
export function attribution(f: CallOutFacts): string {
  const parts = [f.challenger_name.trim() || 'Someone'];
  if (f.games_together && f.games_together > 0) {
    parts.push(`${f.games_together} game${f.games_together === 1 ? '' : 's'} together`);
  }
  const mine = f.rivalry_challenger_wins ?? 0;
  const theirs = f.rivalry_opponent_wins ?? 0;
  const draws = f.rivalry_draws ?? 0;
  if (f.rivalry_id && mine + theirs + draws > 0) {
    parts.push(`rivalry ${mine}–${theirs}`);
  }
  if (f.rematch_of_event_id) parts.push('rematch');
  else if (f.countered_from) parts.push('counter');
  return parts.join(' · ');
}

/**
 * What the foot of the CallOut screen shows:
 * - `answer`: ACCEPT, COUNTER, PASS (a call-out to you or a crew you speak for);
 * - `answer_open`: ACCEPT only (an open call-out has nobody to counter or pass);
 * - `waiting`: yours, still pending (TAKE IT BACK);
 * - `event`: accepted, with its event;
 * - `countered`: answered with a counter (open the counter);
 * - `closed`: passed, withdrawn or ran out of time;
 * - `watching`: pending, but not yours to answer.
 */
export type Reply = 'answer' | 'answer_open' | 'waiting' | 'event' | 'countered' | 'closed' | 'watching';

export function replyFor(f: Pick<CallOutFacts, 'status' | 'is_mine' | 'can_answer' | 'is_open' | 'event_id'>): Reply {
  if (f.status === 'accepted') return f.event_id ? 'event' : 'closed';
  if (f.status === 'countered') return 'countered';
  if (f.status !== 'proposed') return 'closed';
  if (f.is_mine) return 'waiting';
  if (f.can_answer) return f.is_open ? 'answer_open' : 'answer';
  return 'watching';
}

/** The sentence under a call-out that is no longer waiting on you. */
export function closedWords(
  f: Pick<CallOutFacts, 'status' | 'is_mine' | 'challenger_name' | 'opponent_name' | 'is_open' | 'format' | 'expires_at' | 'time_zone'>,
  now: number,
): string {
  const them = shortName(opponentLabel(f), crew(f));
  const challenger = shortName(f.challenger_name, crew(f));
  switch (f.status) {
    case 'accepted':
      return f.is_mine ? `${them} accepted. The event is set.` : 'Accepted. The event is set.';
    case 'countered':
      return f.is_mine ? `${them} countered with new terms.` : 'You countered with new terms.';
    case 'declined':
      return f.is_mine ? `${them} passed on this one.` : 'You passed on this one.';
    case 'withdrawn':
      return f.is_mine ? 'You took this Call-Out back.' : `${challenger} took this Call-Out back.`;
    case 'expired':
      return 'This Call-Out ran out of time. Nobody answered.';
    default: {
      const tz = f.time_zone ?? DEFAULT_TIME_ZONE;
      const runsOut = runsOutWords(f.expires_at, now, tz);
      return f.is_mine
        ? `Waiting on ${f.is_open ? 'someone to accept' : them}. It runs out ${runsOut}.`
        : `Waiting on ${f.is_open ? 'someone to accept' : them}.`;
    }
  }
}

/** "today at 18:00", "tomorrow at 9:00", "Sat at 9:00". */
export function runsOutWords(at: string, now: number, timeZone: string = DEFAULT_TIME_ZONE): string {
  const diff = dayDiff(at, new Date(now), timeZone);
  const p = zonedParts(at, timeZone);
  const time = clock24(p.hour, p.minute);
  if (diff <= 0) return `today at ${time}`;
  if (diff === 1) return `tomorrow at ${time}`;
  if (diff < 7) return `${p.weekday} at ${time}`;
  return `${p.weekday} ${p.day} ${p.monthName}`;
}

// Compete ---------------------------------------------------------------------------------------

/** What Compete needs from `my_call_outs`. */
export type CallOutRowFacts = {
  id: string;
  status: CallOutStatus;
  direction: string;
  format: ChallengeFormat;
  title: string;
  starts_at: string;
  time_zone: string | null;
  place_name: string | null;
  challenger_name: string;
  opponent_name: string | null;
  is_rematch: boolean;
  is_counter: boolean;
  event_id: string | null;
  created_at: string;
};

export type IncomingCard = {
  id: string;
  overline: string;
  headline: string;
  line: string;
  accessibilityLabel: string;
};

/** "5K · Mount Royal loop · Sat 12 Oct, 9:00". */
export function callOutLine(r: Pick<CallOutRowFacts, 'title' | 'place_name' | 'starts_at' | 'time_zone'>): string {
  return [r.title, r.place_name?.trim(), startLine(r.starts_at, r.time_zone ?? DEFAULT_TIME_ZONE)]
    .filter((p): p is string => !!p)
    .join(' · ');
}

/** The newest pending call-out to you, as Compete's INCOMING CALL-OUT block. */
export function incomingCard(rows: readonly CallOutRowFacts[], now: number): IncomingCard | null {
  const r = rows.find((x) => x.direction === 'incoming' && x.status === 'proposed');
  if (!r) return null;
  const name = shortName(r.challenger_name, r.format === 'crew_vs_crew').toUpperCase();
  const headline = r.is_rematch
    ? `${name} WANTS A REMATCH.`
    : r.is_counter
      ? `${name} COUNTERED.`
      : `${name} CALLED YOU OUT.`;
  const line = callOutLine(r);
  return {
    id: r.id,
    overline: `${r.is_counter ? 'COUNTER' : 'INCOMING CALL-OUT'} · ${ageWords(r.created_at, now)}`,
    headline,
    line,
    accessibilityLabel: `${r.is_counter ? 'Counter' : 'Incoming call-out'} from ${shortName(r.challenger_name, r.format === 'crew_vs_crew')}. ${line}. Reply.`,
  };
}

export type StripModel = {
  id: string;
  leading: string;
  leadingLabel: string;
  title: string;
  meta: string;
  /** A badge word and tone, or the LIVE indicator. */
  trailing: { kind: 'badge'; word: string; tone: 'signal' | 'neutral' } | { kind: 'live' };
  href: string;
};

/** "SAT", "TODAY", "NOW", "12 OCT": the strip's leading column (72pt of display-xs). */
export function leadingDay(at: string, now: number, timeZone: string = DEFAULT_TIME_ZONE): { text: string; label: string } {
  const diff = dayDiff(at, new Date(now), timeZone);
  const p = zonedParts(at, timeZone);
  const label = `${p.weekday} ${p.day} ${p.monthName}`;
  if (diff === 0) return { text: 'TODAY', label: `Today, ${label}` };
  if (diff > 0 && diff < 7) return { text: p.weekday.toUpperCase(), label };
  return { text: `${p.day} ${p.monthName}`.toUpperCase(), label };
}

/**
 * The other call-outs: answered ones, more incoming, and the ones you sent. Accepted ones whose
 * event is already in YOUR EVENTS are left out (the event row says it better).
 */
export function callOutStrips(
  rows: readonly CallOutRowFacts[],
  topId: string | null,
  now: number,
  listedEvents: ReadonlySet<string> = new Set(),
): StripModel[] {
  return rows
    .filter((r) => r.id !== topId && !(r.event_id && listedEvents.has(r.event_id)))
    .map((r) => {
      const tz = r.time_zone ?? DEFAULT_TIME_ZONE;
      const crewish = r.format === 'crew_vs_crew';
      const them = shortName(r.opponent_name ?? (crewish ? 'Any crew' : 'Anyone'), crewish);
      const challenger = shortName(r.challenger_name, crewish);
      const outgoing = r.direction === 'outgoing';
      const title = outgoing
        ? `You called out ${r.opponent_name ? them : crewish ? 'any crew' : 'anyone'} · ${r.title}`
        : `${challenger} called you out · ${r.title}`;
      const status = posterStatus(r.status);
      const day = leadingDay(r.starts_at, now, tz);
      const meta = [
        r.is_rematch ? 'Rematch' : r.is_counter ? 'Counter' : null,
        r.place_name?.trim(),
        `${outgoing ? 'Sent' : 'Received'} ${ageWords(r.created_at, now).toLowerCase()}`,
      ]
        .filter((p): p is string => !!p)
        .join(' · ');
      return {
        id: r.id,
        leading: day.text,
        leadingLabel: day.label,
        title,
        meta,
        trailing: { kind: 'badge', word: status, tone: status === 'ACCEPTED' ? 'signal' : 'neutral' },
        href: r.status === 'accepted' && r.event_id ? `/event/${r.event_id}` : `/challenge/${r.id}`,
      } satisfies StripModel;
    });
}

/** What Compete needs from `my_challenge_events`. */
export type EventRowFacts = {
  event_id: string;
  stage: ChallengeStage;
  relation: string;
  format: ChallengeFormat;
  title: string;
  starts_at: string;
  time_zone: string | null;
  a_name: string;
  b_name: string;
  side_size: number | null;
  follower_count: number | null;
  live_period: number | null;
  scoring: ChallengeScoring;
  target: number | null;
  winner_side: 'a' | 'b' | null;
  my_side: 'a' | 'b' | null;
};

const STAGE_WORDS: Record<ChallengeStage, string> = {
  accepted: 'Accepted',
  days: 'Build-up',
  today: 'Event day',
  soon: 'Almost time',
  live: 'Live',
  verifying: 'Verifying',
  disputed: 'Correction open',
  complete: 'Final',
  cancelled: 'Called off',
};

/** Whole days until the start ("3 DAYS"), counted on the event's calendar. */
export function daysUntil(at: string, now: number, timeZone: string = DEFAULT_TIME_ZONE): number {
  return dayDiff(at, new Date(now), timeZone);
}

function eventBadge(r: EventRowFacts, now: number): StripModel['trailing'] {
  const tz = r.time_zone ?? DEFAULT_TIME_ZONE;
  switch (r.stage) {
    case 'live':
      return { kind: 'live' };
    case 'days': {
      const d = daysUntil(r.starts_at, now, tz);
      return { kind: 'badge', word: d <= 1 ? 'TOMORROW' : `${d} DAYS`, tone: 'signal' };
    }
    case 'today':
    case 'soon':
      return { kind: 'badge', word: 'TODAY', tone: 'signal' };
    case 'complete': {
      if (!r.winner_side) return { kind: 'badge', word: 'DRAW', tone: 'neutral' };
      if (r.my_side) return { kind: 'badge', word: r.winner_side === r.my_side ? 'WON' : 'LOST', tone: 'neutral' };
      return { kind: 'badge', word: 'FINAL', tone: 'neutral' };
    }
    case 'cancelled':
      return { kind: 'badge', word: 'CALLED OFF', tone: 'neutral' };
    case 'verifying':
      return { kind: 'badge', word: 'VERIFYING', tone: 'neutral' };
    case 'disputed':
      return { kind: 'badge', word: 'CORRECTION', tone: 'neutral' };
    default:
      return { kind: 'badge', word: 'ACCEPTED', tone: 'neutral' };
  }
}

/** YOUR EVENTS rows: "Chimdi vs Marcus · 5K", "Build-up · 142 following", 3 DAYS. */
export function eventStrip(r: EventRowFacts, now: number): StripModel {
  const tz = r.time_zone ?? DEFAULT_TIME_ZONE;
  const crewish = r.format === 'crew_vs_crew';
  // Your side first (contract rule 9): CHIMDI VS MARCUS when Marcus called Chimdi out.
  const [first, second] = r.my_side === 'b' ? [r.b_name, r.a_name] : [r.a_name, r.b_name];
  const title = crewish ? `${first} vs ${second}` : `${shortName(first)} vs ${shortName(second)} · ${r.title}`;
  const meta: string[] = [];
  if (r.relation === 'following') meta.push('You follow');
  if (crewish) meta.push('Crew-vs-Crew', `${r.side_size ?? 5} a side`);
  else if (r.stage !== 'live' || r.relation !== 'following') meta.push(STAGE_WORDS[r.stage]);
  if (r.stage === 'live' && r.scoring === 'rounds' && r.live_period && r.target) {
    meta.push(`round ${r.live_period} of ${r.target}`);
  } else if (r.stage === 'live' && r.live_period) {
    meta.push(`part ${r.live_period}`);
  } else if (!crewish && (r.follower_count ?? 0) > 0 && r.stage !== 'complete' && r.stage !== 'cancelled') {
    meta.push(`${r.follower_count} following`);
  }
  const day = r.stage === 'live' ? { text: 'NOW', label: 'Live now' } : leadingDay(r.starts_at, now, tz);
  return {
    id: r.event_id,
    leading: day.text,
    leadingLabel: day.label,
    title,
    meta: meta.join(' · '),
    trailing: eventBadge(r, now),
    href: `/event/${r.event_id}`,
  };
}

/** What Compete needs from `my_rivalries`. */
export type RivalryRowFacts = {
  rivalry_id: string;
  kind: 'people' | 'crews';
  a_name: string;
  b_name: string;
  a_wins: number;
  b_wins: number;
  draws: number;
  meetings: number;
  form: readonly string[] | null;
  next_title: string | null;
  next_starts_at: string | null;
  next_time_zone: string | null;
};

export type RivalryModel = {
  id: string;
  a: { name: string };
  b: { name: string };
  record: { a: number; b: number; draws: number };
  history: ('a' | 'b' | 'd')[];
  next: string | undefined;
};

/** The Rivalry component's props for one row (form oldest first, as the server gives it). */
export function rivalryModel(r: RivalryRowFacts): RivalryModel {
  const crews = r.kind === 'crews';
  const next =
    r.next_title && r.next_starts_at
      ? `${r.next_title} · ${shortDate(r.next_starts_at, r.next_time_zone ?? DEFAULT_TIME_ZONE)}`
      : undefined;
  return {
    id: r.rivalry_id,
    a: { name: shortName(r.a_name, crews) },
    b: { name: shortName(r.b_name, crews) },
    record: { a: r.a_wins, b: r.b_wins, draws: r.draws },
    history: (r.form ?? []).map((f) => (f === 'a' ? 'a' : f === 'b' ? 'b' : 'd')),
    next,
  };
}

/**
 * Which rivalry leads (the Rivalry poster): the most recently active one with a meeting, since a
 * rivalry whose first event is still to come has no record to show yet. The rest follow in order.
 */
export function orderRivalries<T extends Pick<RivalryRowFacts, 'meetings'>>(rows: readonly T[]): T[] {
  const lead = rows.findIndex((r) => r.meetings > 0);
  if (lead <= 0) return [...rows];
  return [rows[lead] as T, ...rows.slice(0, lead), ...rows.slice(lead + 1)];
}

/** The rivalries after the first, as strips: "4–3", "Chimdi vs Marcus", "8 meetings". */
export function rivalryStrip(r: RivalryRowFacts): StripModel {
  const crews = r.kind === 'crews';
  const a = shortName(r.a_name, crews);
  const b = shortName(r.b_name, crews);
  const next = rivalryModel(r).next;
  return {
    id: r.rivalry_id,
    leading: `${r.a_wins}–${r.b_wins}`,
    leadingLabel: `${a} ${r.a_wins}, ${b} ${r.b_wins}`,
    title: `${a} vs ${b}`,
    meta: [`${r.meetings} meeting${r.meetings === 1 ? '' : 's'}`, r.draws > 0 ? `${r.draws} drawn` : null, next ? `next ${next}` : null]
      .filter((p): p is string => !!p)
      .join(' · '),
    trailing: { kind: 'badge', word: 'RIVALRY', tone: 'neutral' },
    href: `/rivalry/${r.rivalry_id}`,
  };
}

// When: days and times for the composer and the counter --------------------------------------

/** create_call_out wants the start at least an hour out and within 90 days; we keep a margin. */
export const MIN_LEAD_MINUTES = 65;
/** Days offered in the composer and the counter (the server allows 90). */
export const DAY_CHOICES = 14;

export type DayChoice = { offset: number; label: string };

/** Today, Tomorrow, then "Sat 12" for the next 12 days. */
export function dayChoices(now: Date, timeZone: string = DEFAULT_TIME_ZONE, count = DAY_CHOICES): DayChoice[] {
  const out: DayChoice[] = [];
  for (let offset = 0; offset < count; offset++) {
    if (offset === 0) out.push({ offset, label: 'Today' });
    else if (offset === 1) out.push({ offset, label: 'Tomorrow' });
    else {
      const p = zonedParts(new Date(now.getTime() + offset * DAY), timeZone);
      out.push({ offset, label: `${p.weekday} ${p.day}` });
    }
  }
  return out;
}

/** Half-hour starts from 6 AM to 9:30 PM. */
export function timeChoices(): { minute: number; label: string }[] {
  const out: { minute: number; label: string }[] = [];
  for (let m = 6 * 60; m <= 21 * 60 + 30; m += 30) out.push({ minute: m, label: shortClock(Math.floor(m / 60), m % 60) });
  return out;
}

/** The instant for a day offset and minute of day, in the zone. */
export function startsAtFor(dayOffset: number, minuteOfDay: number, now: Date, timeZone: string = DEFAULT_TIME_ZONE): Date {
  const p = zonedParts(new Date(now.getTime() + dayOffset * DAY), timeZone);
  return zonedTime(p.year, p.month, p.day, Math.floor(minuteOfDay / 60), minuteOfDay % 60, timeZone);
}

/** Times still possible on the chosen day. */
export function timeChoicesFor(dayOffset: number, now: Date, timeZone: string = DEFAULT_TIME_ZONE) {
  return timeChoices().filter(
    (t) => startsAtFor(dayOffset, t.minute, now, timeZone).getTime() - now.getTime() >= MIN_LEAD_MINUTES * MINUTE,
  );
}

/** The day offset and minute of day of an instant (to prefill the counter). */
export function dayAndMinute(at: string, now: Date, timeZone: string = DEFAULT_TIME_ZONE): { dayOffset: number; minuteOfDay: number } {
  const p = zonedParts(at, timeZone);
  return { dayOffset: Math.max(0, dayDiff(at, now, timeZone)), minuteOfDay: p.hour * 60 + p.minute };
}

function leadError(at: Date, now: Date): string | null {
  const lead = at.getTime() - now.getTime();
  if (lead < MIN_LEAD_MINUTES * MINUTE) return 'Pick a start at least an hour from now.';
  if (lead > 90 * DAY) return 'Pick a start within the next 90 days.';
  return null;
}

// Scoring and the target --------------------------------------------------------------------

export const SCORING_CHOICES: readonly { id: ChallengeScoring; label: string }[] = [
  { id: 'time', label: 'Fastest time' },
  { id: 'distance', label: 'Farthest distance' },
  { id: 'score', label: 'Highest score' },
  { id: 'rounds', label: 'Most rounds' },
];

/** The unit the target is written in, and how the field asks for it. */
export function targetField(scoring: ChallengeScoring): { unit: 'km' | 'min' | 'points' | 'rounds'; label: string; placeholder: string } {
  switch (scoring) {
    case 'time':
      return { unit: 'km', label: 'Distance in km (optional)', placeholder: '5' };
    case 'distance':
      return { unit: 'min', label: 'Time limit in minutes (optional)', placeholder: '30' };
    case 'rounds':
      return { unit: 'rounds', label: 'Rounds (optional)', placeholder: '3' };
    default:
      return { unit: 'points', label: 'First to, in points (optional)', placeholder: '21' };
  }
}

/** Endurance sports race the clock by default; the rest keep score. */
export function defaultScoring(sportId: string | null): ChallengeScoring {
  if (!sportId) return 'time';
  return /run|cycl|bike|swim|row|walk|hike|ski/i.test(sportId) ? 'time' : 'score';
}

/** "5", "5.0", "5,5" → 5.5; "" → null (no target); anything else → NaN. */
export function parseTarget(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(t)) return Number.NaN;
  return Number(t);
}

// The composer ------------------------------------------------------------------------------

export type Audience = ChallengeAudience;

export const AUDIENCE_CHOICES: readonly { id: Audience; label: string }[] = [
  { id: 'public', label: 'Public' },
  { id: 'friends', label: "People we've played with" },
  { id: 'participants', label: 'Just us' },
];

/** Who the Call-Out goes to. */
export type Target =
  | { kind: 'person'; id: string; name: string }
  | { kind: 'open' }
  | { kind: 'crew'; id: string | null; name: string | null };

export type ComposerState = {
  target: Target | null;
  /** Crew vs crew: the crew you speak for. */
  myCrewId: string | null;
  sideSize: number;
  sportId: string | null;
  title: string;
  scoring: ChallengeScoring;
  target_text: string;
  dayOffset: number;
  minuteOfDay: number | null;
  placeId: string | null;
  courseNote: string;
  audience: Audience;
  message: string;
};

export const SIDE_SIZE_MIN = 2;
export const SIDE_SIZE_MAX = 11;
export const TITLE_MAX = 24;
export const COURSE_MAX = 140;

export function initialComposer(target: Target | null = null): ComposerState {
  return {
    target,
    myCrewId: null,
    sideSize: 5,
    sportId: null,
    title: '',
    scoring: 'time',
    target_text: '',
    dayOffset: 1,
    minuteOfDay: null,
    placeId: null,
    courseNote: '',
    audience: 'public',
    message: '',
  };
}

export type ComposerErrors = Partial<
  Record<'target' | 'crew' | 'sport' | 'title' | 'target_text' | 'time' | 'course' | 'message', string>
>;

export function validateComposer(f: ComposerState, now: Date, timeZone: string = DEFAULT_TIME_ZONE): ComposerErrors {
  const e: ComposerErrors = {};
  if (!f.target) e.target = 'Pick who you are calling out.';
  if (f.target?.kind === 'crew' && !f.myCrewId) e.crew = 'Pick the crew you speak for.';
  if (!f.sportId) e.sport = 'Pick a sport.';
  const title = f.title.trim();
  if (title.length === 0) e.title = 'Say what it is: 5K, 1v1, first to 3.';
  else if (title.length > TITLE_MAX) e.title = `Keep it under ${TITLE_MAX} characters.`;
  const target = parseTarget(f.target_text);
  if (Number.isNaN(target) || (target !== null && target <= 0)) e.target_text = 'Write it as a number, like 5 or 2.5.';
  if (f.minuteOfDay === null) e.time = 'Pick a start time.';
  else {
    const lead = leadError(startsAtFor(f.dayOffset, f.minuteOfDay, now, timeZone), now);
    if (lead) e.time = lead;
  }
  if (f.courseNote.trim().length > COURSE_MAX) e.course = `Keep the course under ${COURSE_MAX} characters.`;
  if (f.message.trim().length > CALL_OUT_MESSAGE_MAX_LENGTH) e.message = `Keep your line under ${CALL_OUT_MESSAGE_MAX_LENGTH} characters.`;
  return e;
}

export function hasErrors(e: object): boolean {
  return Object.keys(e).length > 0;
}

type CreateArgs = Omit<RpcArgs<'create_call_out'>, 'p_idempotency_key'>;

const opt = (v: string) => {
  const t = v.trim();
  return t.length > 0 ? t : undefined;
};

/** The `create_call_out` arguments for a valid composer (null when it isn't). */
export function composerArgs(f: ComposerState, now: Date, timeZone: string = DEFAULT_TIME_ZONE): CreateArgs | null {
  if (hasErrors(validateComposer(f, now, timeZone)) || !f.target) return null;
  const args: CreateArgs = {
    p_sport_id: f.sportId as string,
    p_title: f.title.trim(),
    p_scoring: f.scoring,
    p_starts_at: startsAtFor(f.dayOffset, f.minuteOfDay as number, now, timeZone).toISOString(),
    p_audience: f.audience,
  };
  if (f.target.kind === 'person') args.p_opponent_id = f.target.id;
  if (f.target.kind === 'crew') {
    args.p_challenger_crew_id = f.myCrewId as string;
    if (f.target.id) args.p_opponent_crew_id = f.target.id;
    args.p_side_size = Math.min(SIDE_SIZE_MAX, Math.max(SIDE_SIZE_MIN, Math.round(f.sideSize)));
  }
  const target = parseTarget(f.target_text);
  if (target !== null && !Number.isNaN(target)) {
    args.p_target = target;
    args.p_unit = targetField(f.scoring).unit;
  }
  if (f.placeId) args.p_place_id = f.placeId;
  const course = opt(f.courseNote);
  if (course) args.p_course_note = course;
  const message = opt(f.message);
  if (message) args.p_message = message;
  return args;
}

/** The line under CALL OUT: what happens next, in words. */
export function composerSummary(f: Pick<ComposerState, 'target'>): string {
  const who =
    f.target?.kind === 'person'
      ? shortName(f.target.name)
      : f.target?.kind === 'crew'
        ? f.target.name ?? 'Any crew'
        : 'Anyone who sees it';
  const answer = f.target?.kind === 'open' || (f.target?.kind === 'crew' && !f.target.id) ? 'can accept it' : 'can accept, counter or pass';
  return `${who} ${answer}. Accepting creates the Challenge Event. No stakes, ever.`;
}

// The counter -------------------------------------------------------------------------------

export type CounterDraft = {
  dayOffset: number;
  minuteOfDay: number | null;
  title: string;
  target_text: string;
  placeId: string | null;
  courseNote: string;
  message: string;
};

/** The counter starts from the call-out's terms. */
export function counterDraft(
  f: Pick<CallOutFacts, 'starts_at' | 'time_zone' | 'title' | 'target' | 'place_id' | 'course_note'>,
  now: Date,
): CounterDraft {
  const { dayOffset, minuteOfDay } = dayAndMinute(f.starts_at, now, f.time_zone ?? DEFAULT_TIME_ZONE);
  return {
    dayOffset,
    minuteOfDay,
    title: f.title,
    target_text: f.target ? String(f.target) : '',
    placeId: f.place_id,
    courseNote: f.course_note ?? '',
    message: '',
  };
}

type CounterArgs = Omit<RpcArgs<'counter_call_out'>, 'p_idempotency_key' | 'p_call_out_id'>;

export type CounterResult = { ok: true; args: CounterArgs } | { ok: false; errors: ComposerErrors & { nothing?: string } };

/**
 * Only what changed goes to `counter_call_out` (the server keeps the rest). A counter that changes
 * nothing is refused here, in words, before the server says the same.
 */
export function counterArgs(
  f: Pick<CallOutFacts, 'starts_at' | 'time_zone' | 'title' | 'target' | 'unit' | 'scoring' | 'place_id' | 'course_note'>,
  d: CounterDraft,
  now: Date,
): CounterResult {
  const tz = f.time_zone ?? DEFAULT_TIME_ZONE;
  const errors: ComposerErrors & { nothing?: string } = {};
  const args: CounterArgs = {};
  if (d.minuteOfDay === null) errors.time = 'Pick a start time.';
  else {
    const at = startsAtFor(d.dayOffset, d.minuteOfDay, now, tz);
    if (at.getTime() !== Date.parse(f.starts_at)) {
      const lead = leadError(at, now);
      if (lead) errors.time = lead;
      else args.p_starts_at = at.toISOString();
    }
  }
  const title = d.title.trim();
  if (title.length === 0) errors.title = 'Say what it is: 5K, 1v1, first to 3.';
  else if (title.length > TITLE_MAX) errors.title = `Keep it under ${TITLE_MAX} characters.`;
  else if (title !== f.title) args.p_title = title;
  const target = parseTarget(d.target_text);
  if (Number.isNaN(target) || (target !== null && target <= 0)) errors.target_text = 'Write it as a number, like 5 or 2.5.';
  else if (target !== null && target !== f.target) {
    args.p_target = target;
    args.p_unit = f.unit ?? targetField(f.scoring).unit;
  }
  if (d.placeId && d.placeId !== f.place_id) args.p_place_id = d.placeId;
  const course = d.courseNote.trim();
  if (course.length > COURSE_MAX) errors.course = `Keep the course under ${COURSE_MAX} characters.`;
  else if (course.length > 0 && course !== (f.course_note ?? '')) args.p_course_note = course;
  const message = d.message.trim();
  if (message.length > CALL_OUT_MESSAGE_MAX_LENGTH) {
    errors.message = `Keep your line under ${CALL_OUT_MESSAGE_MAX_LENGTH} characters.`;
  } else if (message.length > 0) args.p_message = message;
  if (!hasErrors(errors)) {
    const changed = Object.keys(args).some((k) => k !== 'p_message');
    if (!changed) errors.nothing = 'Change the time, distance or course to counter.';
  }
  return hasErrors(errors) ? { ok: false, errors } : { ok: true, args };
}
