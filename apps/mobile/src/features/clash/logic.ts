/**
 * Pure copy and rules for Ojoro Clash (design-handoff/screens/Clash.png; docs/COMMUNITIES_CONTRACT.md,
 * Ojoro Clash). Your clan goes first when you're in it (`clashSides`). Backing never changes a
 * score. No React Native imports.
 */
import { clashScore, clashSides, formatClashValue, type ClashScoring } from '@ojoro/contracts';

import { clock, clockWithPeriod, dayDiff, zonedParts } from '../plans/time';

type Side = 'a' | 'b';

const WEEKDAYS_LONG: Record<string, string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday',
};

export type ClashFacts = {
  title: string;
  season_label: string | null;
  a_name: string;
  a_short_name: string;
  b_name: string;
  b_short_name: string;
  stage: 'proposed' | 'upcoming' | 'live' | 'complete' | 'declined' | 'cancelled';
  my_side: Side | null;
  event_count: number;
  decided_count: number;
  a_wins: number;
  b_wins: number;
  draws: number;
  leader: Side | null;
  first_starts_at: string | null;
  time_zone: string;
};

/** "OJORO CLASH · FALL 2026". */
export function clashOverline(v: Pick<ClashFacts, 'season_label' | 'title'>): string {
  return `OJORO CLASH · ${(v.season_label ?? v.title).toUpperCase()}`;
}

/**
 * A clan in a sentence: "Concordia", "McGill". The short name is a poster word in capitals; when it
 * is the first word of the full name, that word keeps its own casing.
 */
export function speakName(shortName: string, name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? '';
  if (first.toUpperCase() === shortName.trim().toUpperCase()) return first;
  if (shortName !== shortName.toUpperCase()) return shortName;
  return shortName.charAt(0) + shortName.slice(1).toLowerCase();
}

export type ClashSideView = { key: Side; poster: string; spoken: string };

/** The two sides as the poster stacks them: yours first. */
export function posterSides(v: ClashFacts): [ClashSideView, ClashSideView] {
  const a: ClashSideView = { key: 'a', poster: v.a_short_name.toUpperCase(), spoken: speakName(v.a_short_name, v.a_name) };
  const b: ClashSideView = { key: 'b', poster: v.b_short_name.toUpperCase(), spoken: speakName(v.b_short_name, v.b_name) };
  return clashSides(v, a, b);
}

/** "2-1" from your side, plus the words beside it: AFTER 3 OF 6 · "Concordia leads". */
export function scoreBlock(v: ClashFacts, now: Date): { score: string; label: string; line: string; spoken: string } {
  const s = clashScore(v);
  const [first, second] = posterSides(v);
  const leader = v.leader === 'a' ? speakName(v.a_short_name, v.a_name) : v.leader === 'b' ? speakName(v.b_short_name, v.b_name) : null;
  let label: string;
  let line: string;
  switch (v.stage) {
    case 'proposed':
      label = 'PROPOSED';
      line = `${v.event_count} events, waiting on an answer`;
      break;
    case 'upcoming':
      label = `${v.event_count} EVENTS`;
      line = v.first_starts_at ? `Starts ${startsWords(v.first_starts_at, now, v.time_zone)}` : 'Starting soon';
      break;
    case 'complete':
      label = 'FINAL';
      line = leader ? `${leader} won the Clash` : 'Level at the end';
      break;
    case 'declined':
      label = 'DECLINED';
      line = 'This Clash never started';
      break;
    case 'cancelled':
      label = 'CALLED OFF';
      line = 'No results count';
      break;
    default:
      label = `AFTER ${v.decided_count} OF ${v.event_count}`;
      line = leader ? `${leader} leads` : 'Level';
  }
  const spoken = `${first.spoken} ${s.mine}, ${second.spoken} ${s.theirs}, ${label.toLowerCase()}`;
  return { score: s.text, label, line, spoken };
}

function startsWords(at: string, now: Date, timeZone: string): string {
  const diff = dayDiff(at, now, timeZone);
  const p = zonedParts(at, timeZone);
  if (diff === 0) return `today at ${clockWithPeriod(at, timeZone)}`;
  if (diff === 1) return `tomorrow at ${clockWithPeriod(at, timeZone)}`;
  return `${p.weekday} ${p.day} ${p.monthName}`;
}

export type MyPartFacts = {
  position: number;
  title: string;
  sport_id: string;
  starts_at: string;
  place_name: string | null;
  place_area: string | null;
  squad_size: number | null;
  squad_taken: number;
  i_am_in: boolean;
};

function dayName(at: string, now: Date, timeZone: string): string {
  const diff = dayDiff(at, now, timeZone);
  const p = zonedParts(at, timeZone);
  if (diff === 0) return p.hour >= 17 ? 'tonight' : 'today';
  if (diff === 1) return 'tomorrow';
  if (diff > 1 && diff < 7) return WEEKDAYS_LONG[p.weekday] ?? p.weekday;
  return `${p.weekday} ${p.day} ${p.monthName}`;
}

/** YOUR PART: "You're in the football squad for Saturday." and its line of facts. */
export function myPartCopy(p: MyPartFacts, now: Date, timeZone: string): { overline: string; title: string; meta: string } {
  const sport = p.sport_id.replace(/_/g, ' ');
  const day = dayName(p.starts_at, now, timeZone);
  const title = p.i_am_in
    ? `You're in the ${sport} squad for ${day}.`
    : `Your clan's ${sport} squad has room for ${day}.`;
  const spots = p.squad_size ? `${p.squad_taken} of ${p.squad_size} squad spots taken` : `${p.squad_taken} in the squad`;
  const meta = [p.title, p.place_name ?? p.place_area, clockWithPeriod(p.starts_at, timeZone), spots].filter(Boolean).join(' · ');
  return { overline: `YOUR PART · EVENT ${p.position}`, title, meta };
}

export type EventFacts = {
  clash_event_id: string;
  position: number;
  title: string;
  scoring: ClashScoring;
  starts_at: string;
  place_name: string | null;
  place_area: string | null;
  state: 'upcoming' | 'this_week' | 'live' | 'verifying' | 'decided';
  is_final: boolean;
  a_value: number | null;
  b_value: number | null;
  winner_side: Side | null;
  result_source: 'organizer_verified' | 'captains_confirmed' | null;
};

export type EventRow = { meta: string; badge: string; signal: boolean };

/** One of THE SIX EVENTS: the result or what's next, and its badge (a winner, SAT, UPCOMING, FINAL). */
export function eventRow(e: EventFacts, v: Pick<ClashFacts, 'my_side' | 'a_short_name' | 'b_short_name'>, now: Date, timeZone: string): EventRow {
  const p = zonedParts(e.starts_at, timeZone);
  const date = `${p.weekday} ${p.day} ${p.monthName}`;
  const where = e.place_name ?? e.place_area;
  switch (e.state) {
    case 'decided': {
      const mine = v.my_side ?? 'a';
      if (!e.winner_side) {
        return { meta: resultLine(e, null), badge: 'DRAW', signal: false };
      }
      const name = (e.winner_side === 'a' ? v.a_short_name : v.b_short_name).toUpperCase();
      return { meta: resultLine(e, e.winner_side), badge: name, signal: e.winner_side === mine };
    }
    case 'verifying':
      return { meta: 'Result in, waiting for the other captain', badge: 'NOT FINAL', signal: false };
    case 'live':
      return { meta: [where, 'on now'].filter(Boolean).join(' · '), badge: 'LIVE', signal: true };
    case 'this_week': {
      const diff = dayDiff(e.starts_at, now, timeZone);
      const day = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : p.weekday;
      return {
        meta: `${day} ${clock(e.starts_at, timeZone)} · squads forming`,
        badge: e.is_final ? 'FINAL' : diff === 0 ? 'TODAY' : p.weekday.toUpperCase(),
        signal: false,
      };
    }
    default:
      return { meta: [date, where].filter(Boolean).join(' · '), badge: e.is_final ? 'FINAL' : 'UPCOMING', signal: false };
  }
}

/** "Organizer verified", or the two values with the winner's first: "21–17". */
export function resultLine(e: Pick<EventFacts, 'a_value' | 'b_value' | 'scoring' | 'result_source'>, winner: Side | null): string {
  if (e.result_source === 'organizer_verified') return 'Organizer verified';
  const a = formatClashValue(e.a_value, e.scoring);
  const b = formatClashValue(e.b_value, e.scoring);
  if (a === null || b === null) return 'Verified';
  return winner === 'b' ? `${b}–${a}` : `${a}–${b}`;
}

/** Backing is open while the Clash is upcoming or live; members back only their own clan. */
export function canBack(v: Pick<ClashFacts, 'stage' | 'my_side'>, side: Side): boolean {
  if (v.stage !== 'upcoming' && v.stage !== 'live') return false;
  return v.my_side === null || v.my_side === side;
}

/** The share text for the poster. */
export function clashShareText(v: ClashFacts, now: Date): string {
  const [first, second] = posterSides(v);
  const s = scoreBlock(v, now);
  return `Ojoro Clash: ${first.spoken} vs ${second.spoken}, ${s.score} (${s.label.toLowerCase()}).`;
}
