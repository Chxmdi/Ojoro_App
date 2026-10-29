/**
 * Pure rules for the Rivalry screen (design-handoff/screens/Rivalry.png, PRD §9.15 and §10.13):
 * the header, the recent meetings, the next meeting and which rematch block shows. The server
 * orients every row to the viewer (side `a` is you when you're in the rivalry), so nothing here
 * decides who is who. No React Native imports.
 */
import type {
  ChallengeScoring,
  ChallengeStage,
  RivalryMeeting as ContractMeeting,
  RivalryView as ContractView,
} from '@ojoro/contracts';

import { formatChallengeValue } from '@ojoro/contracts';

import { firstName, shortDate, zonedParts } from '../activities/format';

type Nullable<T> = { [K in keyof T]: T[K] | null };

/** `rivalry_view`: the generated types say non-null, but every "last", "next" and "rematch" field can be null. */
export type RivalryViewRow = Nullable<ContractView> &
  Pick<ContractView, 'rivalry_id' | 'kind' | 'a_name' | 'b_name' | 'i_am_in' | 'meetings' | 'a_wins' | 'b_wins' | 'draws'>;

/** `rivalry_meetings`: values and the place can be null. */
export type RivalryMeetingRow = Nullable<ContractMeeting> &
  Pick<ContractMeeting, 'event_id' | 'starts_at' | 'title' | 'scoring' | 'winner'>;

export type Side = 'a' | 'b' | 'd';

function side(w: string | null | undefined): Side | null {
  return w === 'a' || w === 'b' || w === 'd' ? w : null;
}

/**
 * People go by first name on the Rivalry ("CHIMDI 5 / MARCUS 3"), as in the design; crews keep their
 * full name.
 */
export function withShownNames<T extends Pick<RivalryViewRow, 'kind' | 'a_name' | 'b_name' | 'rematch_from_name'>>(view: T): T {
  if (view.kind !== 'people') return view;
  return {
    ...view,
    a_name: firstName(view.a_name),
    b_name: firstName(view.b_name),
    rematch_from_name: view.rematch_from_name ? firstName(view.rematch_from_name) : view.rematch_from_name,
  };
}

/** "CHIMDI · MARCUS" (the header). */
export function headerTitle(view: Pick<RivalryViewRow, 'a_name' | 'b_name'>): string {
  return `${view.a_name} · ${view.b_name}`.toUpperCase();
}

/** The form line for the Rivalry component: last 8, oldest first, unknown entries dropped. */
export function formHistory(form: readonly string[] | null | undefined): Side[] {
  return (form ?? []).flatMap((f) => {
    const s = side(f);
    return s ? [s] : [];
  });
}

/** "12.10": day and month where it happened. */
export function meetingDate(startsAt: string, timeZone?: string | null): string {
  const p = zonedParts(startsAt, timeZone ?? undefined);
  const two = (n: number) => n.toString().padStart(2, '0');
  return `${two(p.day)}.${two(p.month)}`;
}

/** "5K · Mount Royal": the title, then the place unless the title already names it. */
export function meetingTitle(m: Pick<RivalryMeetingRow, 'title' | 'place_name'>): string {
  const title = m.title.trim();
  const place = m.place_name?.trim();
  if (!place || title.toLowerCase().includes(place.toLowerCase())) return title;
  return `${title} · ${place}`;
}

/** How the result was verified, in the meeting line. */
export function sourceWords(source: string | null | undefined): string | null {
  if (source === 'participant_confirmation') return 'participant confirmed';
  if (source === 'organizer_review') return 'organizer reviewed';
  return null;
}

/**
 * The score part of a meeting line, from side a: "22:48 vs 23:31" for times and distances,
 * "3–3" for scores and rounds. Null when a value is missing.
 */
export function meetingScore(
  m: Pick<RivalryMeetingRow, 'a_value' | 'b_value' | 'scoring' | 'unit'>,
): string | null {
  if (m.a_value === null || m.b_value === null) return null;
  if (m.scoring === 'time' || m.scoring === 'distance') {
    const a = formatChallengeValue(m.a_value, m.scoring, m.unit);
    const b = formatChallengeValue(m.b_value, m.scoring, m.unit);
    return a && b ? `${a} vs ${b}` : null;
  }
  return `${Math.round(m.a_value)}–${Math.round(m.b_value)}`;
}

/** "22:48 vs 23:31 · participant confirmed". */
export function meetingLine(m: RivalryMeetingRow, aName: string, bName: string): string {
  const score =
    meetingScore(m) ??
    (m.margin !== null && side(m.winner) !== 'd' && side(m.winner)
      ? `${m.winner === 'a' ? aName : bName} by ${shortMargin(m.margin, m.scoring).toLowerCase()}`
      : null);
  return [score, sourceWords(m.source)].filter(Boolean).join(' · ');
}

/**
 * The winner badge: the winner's name filled for side a and outlined for side b, DRAW outlined
 * (the same rule as the form cells, so it never rests on colour).
 */
export function meetingBadge(
  winner: string,
  aName: string,
  bName: string,
): { text: string; tone: 'signal' | 'neutral' } {
  const s = side(winner);
  if (s === 'a') return { text: aName.toUpperCase(), tone: 'signal' };
  if (s === 'b') return { text: bName.toUpperCase(), tone: 'neutral' };
  return { text: 'DRAW', tone: 'neutral' };
}

/** "43S", "1:02", "0.3 KM", "2": the margin as the overline says it. */
export function shortMargin(margin: number, scoring: ChallengeScoring | null, unit?: string | null): string {
  const m = Math.abs(margin);
  if (scoring === 'time') {
    const s = Math.round(m);
    return s < 60 ? `${s}S` : (formatChallengeValue(s, 'time') ?? `${s}S`);
  }
  if (scoring === 'distance') return `${m.toFixed(1)} KM`;
  const n = Math.round(m);
  return unit ? `${n} ${unit}`.toUpperCase() : String(n);
}

/** "CHIMDI BY 43S", "DRAW", or null before a first meeting. */
export function lastTimeLine(
  view: Pick<RivalryViewRow, 'a_name' | 'b_name' | 'last_winner' | 'last_margin' | 'last_scoring' | 'last_unit'>,
): string | null {
  const s = side(view.last_winner);
  if (!s) return null;
  if (s === 'd') return 'DRAW';
  const name = (s === 'a' ? view.a_name : view.b_name).toUpperCase();
  if (view.last_margin === null || view.last_margin === 0) return name;
  return `${name} BY ${shortMargin(view.last_margin, view.last_scoring, view.last_unit)}`;
}

/** "the 5K", as the Rematch sentence reads ("wants the 5K again"). */
export function discipline(title: string | null | undefined): string {
  const t = title?.trim();
  return t ? `the ${t}` : 'it';
}

const STAGE_WORDS: Partial<Record<ChallengeStage, string>> = {
  live: 'live now',
  verifying: 'verifying',
  disputed: 'verifying',
};

/** NEXT on the Rivalry block: "5K · Sat 12 Oct", or "5K · live now". */
export function nextLine(
  view: Pick<RivalryViewRow, 'next_event_id' | 'next_title' | 'next_starts_at' | 'next_time_zone' | 'next_stage'>,
): string | null {
  if (!view.next_event_id || !view.next_title) return null;
  const stage = view.next_stage ? STAGE_WORDS[view.next_stage] : undefined;
  if (stage) return `${view.next_title} · ${stage}`;
  if (!view.next_starts_at) return view.next_title;
  return `${view.next_title} · ${shortDate(view.next_starts_at, view.next_time_zone ?? undefined)}`;
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/**
 * The promise under RUN IT BACK: "Accepting creates a new Call-Out linked to this rivalry.
 * Saturday's result stays exactly as it is." The day name only within a week; a date after that.
 */
export function rematchPromise(
  accepting: boolean,
  last: { starts_at: string; time_zone: string | null } | null,
  now: Date = new Date(),
): string {
  const first = accepting
    ? 'Accepting creates a new Call-Out linked to this rivalry.'
    : 'Asking sends a new Call-Out linked to this rivalry.';
  if (!last) return `${first} Past results stay exactly as they are.`;
  const tz = last.time_zone ?? undefined;
  const days = (now.getTime() - Date.parse(last.starts_at)) / 86_400_000;
  const when =
    days < 7
      ? `${WEEKDAY_NAMES[zonedParts(last.starts_at, tz).weekday]}'s result`
      : `The result from ${shortDate(last.starts_at, tz).replace(/^\w+ /, '')}`;
  return `${first} ${when} stays exactly as it is.`;
}

/** Which rematch block the screen shows. */
export type RematchBlock =
  /** They asked; you can answer: RUN IT BACK accepts, NOT YET declines. */
  | { kind: 'answer'; callOutId: string; requester: string; opponent: string; discipline: string; note: string | null }
  /** Your side asked; waiting on them. */
  | { kind: 'waiting'; callOutId: string; opponent: string }
  /** A rematch is pending that you can't answer (a spectator, or a crew member who isn't captain). */
  | { kind: 'pending'; callOutId: string; requester: string }
  /** You're in it, the last meeting is final and nothing is scheduled: ask to go again. */
  | { kind: 'offer'; eventId: string; opponent: string; discipline: string }
  /** The next meeting is already on. */
  | { kind: 'scheduled'; eventId: string }
  | { kind: 'none' };

export function rematchBlock(view: RivalryViewRow): RematchBlock {
  if (view.rematch_call_out_id) {
    const requesterIsA = view.rematch_from === 'a';
    const requester = view.rematch_from_name ?? (requesterIsA ? view.a_name : view.b_name);
    if (view.rematch_can_answer) {
      return {
        kind: 'answer',
        callOutId: view.rematch_call_out_id,
        requester,
        opponent: requesterIsA ? view.b_name : view.a_name,
        discipline: discipline(view.rematch_title ?? view.last_title),
        note: view.rematch_message?.trim() || null,
      };
    }
    if (view.i_am_in && requesterIsA) {
      return { kind: 'waiting', callOutId: view.rematch_call_out_id, opponent: view.b_name };
    }
    return { kind: 'pending', callOutId: view.rematch_call_out_id, requester };
  }
  if (view.next_event_id) return { kind: 'scheduled', eventId: view.next_event_id };
  if (view.i_am_in && view.last_event_id) {
    return { kind: 'offer', eventId: view.last_event_id, opponent: view.b_name, discipline: discipline(view.last_title) };
  }
  return { kind: 'none' };
}
