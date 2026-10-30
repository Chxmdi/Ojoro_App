/**
 * TELL OJORO (Create.png): the Movement Concierge. The `concierge` Edge Function asks Claude for one
 * best match with a plain-language WHY (or which way to start something), checked against what the
 * search found; it falls back to the rules stub (`concierge_suggest`) and so does the app when the
 * function can't be reached (docs/CONCIERGE_CONTRACT.md). It suggests only: nothing is sent or
 * joined until the person confirms.
 */
import { answerFromSuggestions, parseConciergeAnswer, type ConciergeAnswer, type ConciergeStart, type Suggestion } from '@ojoro/contracts';

import { clock, clockWithPeriod, DEFAULT_TIME_ZONE, dayDiff, dayLabel } from '../plans/time';

export const CONCIERGE_HINT = 'Ojoro suggests. Nothing is sent or joined until you confirm.';

/** Below this many characters we don't ask (a letter or two says nothing). */
export const CONCIERGE_MIN_CHARS = 3;
export const CONCIERGE_DEBOUNCE_MS = 600;

/** The text we send: trimmed, spaces squeezed, at most 200 characters; null when too short. */
export function conciergeQuery(text: string): string | null {
  const q = text.replace(/\s+/g, ' ').trim().slice(0, 200);
  return q.length >= CONCIERGE_MIN_CHARS ? q : null;
}

/** Columns the contract documents as nullable (rule 2), even where the generated types say not. */
type Nullable<T> = { [K in keyof T]: T[K] | null };

export type Idea = Pick<Suggestion, 'kind' | 'sport_id' | 'sport_name' | 'starts_at'> &
  Nullable<
    Pick<
      Suggestion,
      'plan_id' | 'title' | 'place_name' | 'member_count' | 'capacity' | 'demand_count' | 'window_start' | 'window_end' | 'reason'
    >
  >;

/** "Pickup football · 7:30 · Jeanne-Mance Park"; another day: "· Tomorrow 7:30". Demand: "Running · Tomorrow from 6 PM · 3 people down". */
export function ideaTitle(i: Idea, now: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  const name = i.title?.trim() || i.sport_name;
  if (i.kind === 'demand') {
    const n = i.demand_count ?? 0;
    const today = dayDiff(i.starts_at, now, timeZone) === 0;
    const day = today ? '' : `${dayLabel(i.starts_at, now, timeZone)} `;
    return `${name} · ${day}from ${clockWithPeriod(i.starts_at, timeZone)} · ${n} ${n === 1 ? 'person' : 'people'} down`;
  }
  const today = dayDiff(i.starts_at, now, timeZone) === 0;
  const when = today ? clock(i.starts_at, timeZone) : `${dayLabel(i.starts_at, now, timeZone)} ${clock(i.starts_at, timeZone)}`;
  return [name, when, i.place_name].filter(Boolean).join(' · ');
}

/** "Why: it fits your 90 minutes, it's 1.2 km away and 3 people you've played with are in." */
export function ideaWhy(i: Pick<Idea, 'reason'>): string | null {
  const r = i.reason?.trim();
  if (!r) return null;
  return `Why: ${r.replace(/\.$/, '')}.`;
}

/** The counts under the Progress: "6 / 8 IN · 2 SPOTS LEFT" · "3 DOWN · A PLAN AT 4". */
export function ideaCount(i: Pick<Idea, 'kind' | 'member_count' | 'capacity' | 'demand_count'>): {
  value: number;
  max: number;
  label: string;
  spoken: string;
} | null {
  if (i.kind === 'demand') {
    const n = i.demand_count ?? 0;
    if (n <= 0) return null;
    return { value: n, max: n + 1, label: `${n} DOWN · A PLAN AT ${n + 1}`, spoken: `${n} down. It becomes a plan at ${n + 1}.` };
  }
  const n = i.member_count ?? 0;
  const cap = i.capacity ?? 0;
  if (cap <= 0) return null;
  const left = Math.max(0, cap - n);
  const spots = left === 1 ? '1 SPOT LEFT' : `${left} SPOTS LEFT`;
  return { value: Math.min(n, cap), max: cap, label: `${n} / ${cap} IN · ${spots}`, spoken: `${n} of ${cap} in` };
}

/** The confirm button: I'M DOWN joins a plan; MAKE IT HAPPEN forms one from the demand. */
export function confirmLabel(i: Pick<Idea, 'kind'>): string {
  return i.kind === 'demand' ? 'MAKE IT HAPPEN' : "I'M DOWN";
}

/** "2 MORE IDEAS" / "1 MORE IDEA" / "HIDE IDEAS"; null when there are none. */
export function moreIdeasLabel(more: number, open: boolean): string | null {
  if (more <= 0) return null;
  if (open) return 'HIDE IDEAS';
  return `${more} MORE ${more === 1 ? 'IDEA' : 'IDEAS'}`;
}

/** What nothing found means, with the next step. */
export const NOTHING_FITS =
  "Nothing near you fits that right now. Say you're down for it and Ojoro gathers people around it.";

/** The errors the Concierge can give, in words. */
export function conciergeErrorLine(code: string, detail: string | null | undefined): string | null {
  if (code === 'invalid_argument' && detail === 'minutes') {
    return 'Ojoro plans from 15 minutes to 8 hours. Try a different length.';
  }
  if (code === 'sport_unknown') return "Ojoro doesn't know that sport yet. Try another word for it.";
  return null;
}

/** "Why: …" for an idea in an answer: the answer's WHY for its best match, the idea's reason otherwise. */
export function answerWhy(answer: Pick<ConciergeAnswer, 'best' | 'why'>, idea: Idea): string | null {
  if (answer.best && idea === answer.best && answer.why?.trim()) return ideaWhy({ reason: answer.why });
  return ideaWhy(idea);
}

/** The best match first, then the other ideas. */
export function answerIdeas(answer: Pick<ConciergeAnswer, 'best' | 'more'>): Idea[] {
  return [...(answer.best ? [answer.best] : []), ...answer.more] as Idea[];
}

/** A stable key for an answer, so a new one starts from its best match again. */
export function answerKey(answer: ConciergeAnswer | undefined): string {
  if (!answer) return '';
  const ideas = answerIdeas(answer).map((r) => r.plan_id ?? `${r.sport_id}-${r.starts_at}`);
  return [answer.outcome, answer.start ?? '', ...ideas].join('|');
}

/** When nothing fits, the panel: a way to start something, in the fixed Ojoro words. */
export function nothingFitsPanel(answer: Pick<ConciergeAnswer, 'outcome' | 'start'>): {
  overline: string;
  body: string;
  action: string;
  start: ConciergeStart;
} {
  if (answer.outcome === 'not_movement') {
    return {
      overline: 'TELL OJORO WHAT YOU WANT TO DO',
      body: 'Ojoro finds games and plans near you. Say how long you have, what you want to play or that you want to meet people.',
      action: "SAY YOU'RE DOWN",
      start: 'down_for',
    };
  }
  switch (answer.start ?? 'down_for') {
    case 'quick_plan':
      return {
        overline: 'NOTHING FITS YET',
        body: 'Nothing near you fits that right now. Pick the sport, a time and a place, and Ojoro brings people to it.',
        action: 'QUICK PLAN',
        start: 'quick_plan',
      };
    case 'activity':
      return {
        overline: 'NOTHING FITS YET',
        body: 'Nothing near you fits that right now. Set it up as an activity with capacity, teams and kit.',
        action: 'ACTIVITY',
        start: 'activity',
      };
    case 'call_out':
      return {
        overline: 'NOTHING FITS YET',
        body: 'Nothing near you fits that right now. Call someone out. If they accept, it becomes an event.',
        action: 'CALL OUT',
        start: 'call_out',
      };
    default:
      return { overline: 'NOTHING FITS YET', body: NOTHING_FITS, action: "SAY YOU'RE DOWN", start: 'down_for' };
  }
}

/**
 * What to do with the function's reply. `answer`: show it. `fallback`: the function isn't there or
 * broke (no answer, 404, 5xx, a body that isn't an answer); ask `concierge_suggest` directly.
 * `error`: the person's own error (a PostgREST-shaped 4xx); show it in words.
 */
export function invokeOutcome(
  status: number | null,
  body: unknown,
): { kind: 'answer'; answer: ConciergeAnswer } | { kind: 'fallback' } | { kind: 'error'; body: unknown } {
  if (status === null || status === 200) {
    const answer = status === 200 ? parseConciergeAnswer(body) : null;
    return answer ? { kind: 'answer', answer } : { kind: 'fallback' };
  }
  const b = body as { code?: unknown; message?: unknown } | null;
  const postgrest = !!b && typeof b === 'object' && b.code === 'P0001' && typeof b.message === 'string';
  if (status >= 400 && status < 500 && postgrest) return { kind: 'error', body };
  return { kind: 'fallback' };
}

/** The app's own rules answer from `concierge_suggest` rows. */
export function rulesFallback(rows: readonly Suggestion[]): ConciergeAnswer {
  return answerFromSuggestions(rows, 'unreachable');
}
