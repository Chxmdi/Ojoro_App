/**
 * Pure rules for the last three stages of a Challenge Event: EventLive (live lanes, freshness, the
 * locked crowd, CHEER THEM ON), Verifying (the NOT FINAL numbers and each confirmation) and Result
 * (the verified recap, the crowd's call, the rivalry). No React Native imports.
 *
 * Wording follows the designs, with one honest change until device data arrives (PRD M10): numbers
 * are logged and confirmed by the competitors, so nothing here says "GPS" or "device verified".
 */
import {
  formatChallengeValue,
  formatMargin,
  PREDICTION_MIN_COUNT,
  RESULT_AUTO_CONFIRM_HOURS,
  type ChallengeScoring,
  type ChallengeSide,
  type ChallengeStage,
  type ReactionWord,
  type VerificationCheck,
} from '@ojoro/contracts';

import { firstName, weekdayClock } from '../activities/format';
import { reactionRows, type ReactionState } from '../live/logic';

/** The event facts these screens read (a subset of `challenge_event_view`, nullable as served). */
export type StageFacts = {
  /** Crew names stay whole; people go by first name. */
  format?: 'person_vs_person' | 'crew_vs_crew' | undefined;
  stage: ChallengeStage;
  scoring: ChallengeScoring;
  title: string;
  a_name: string;
  b_name: string;
  server_now: string;
  target: number | null;
  unit: string | null;
  a_progress: number | null;
  b_progress: number | null;
  a_checked_in: boolean | null;
  b_checked_in: boolean | null;
  live_at: string | null;
  live_period: number | null;
  progress_updated_at: string | null;
  progress_logged_by_name: string | null;
  follower_count: number | null;
  watched_count: number | null;
  my_side: ChallengeSide | null;
  is_competitor: boolean | null;
  is_captain: boolean | null;
  prediction_count: number | null;
  prediction_a_pct: number | null;
  prediction_b_pct: number | null;
  my_prediction: ChallengeSide | null;
  result_a: number | null;
  result_b: number | null;
  winner_side: ChallengeSide | null;
  is_draw: boolean | null;
  margin: number | null;
  result_note: string | null;
  result_source: string | null;
  crowd_called_it: boolean | null;
  crowd_pick_side: ChallengeSide | null;
  crowd_pick_pct: number | null;
  rivalry_a_wins: number | null;
  rivalry_b_wins: number | null;
  rivalry_draws: number | null;
  rivalry_meetings: number | null;
};

/** Progress older than this is stale: the line says so and the lanes may have moved. */
export const STALE_AFTER_S = 120;

/** Side names as people say them: "Chimdi", or the crew's name in full. */
export function sideName(f: Pick<StageFacts, 'a_name' | 'b_name' | 'format'>, side: ChallengeSide): string {
  const name = (side === 'a' ? f.a_name : f.b_name) || (side === 'a' ? 'Side A' : 'Side B');
  return f.format === 'crew_vs_crew' ? name : firstName(name);
}

function other(side: ChallengeSide): ChallengeSide {
  return side === 'a' ? 'b' : 'a';
}

/** "CHIMDI VS MARCUS · 5K". */
export function matchOverline(f: Pick<StageFacts, 'a_name' | 'b_name' | 'format' | 'title'>): string {
  return `${sideName(f, 'a')} vs ${sideName(f, 'b')} · ${f.title}`.toUpperCase();
}

/** Server time now, from `server_now` plus what has passed on this device since it arrived. */
export function serverNow(serverNowIso: string, receivedAt: number, now: number): number {
  return Date.parse(serverNowIso) + (now - receivedAt);
}

/** The race clock since LIVE: "16:42", "1:02:03". Null before LIVE. */
export function elapsedClock(liveAt: string | null, serverNowMs: number): string | null {
  if (!liveAt) return null;
  const s = Math.max(0, Math.floor((serverNowMs - Date.parse(liveAt)) / 1000));
  return formatChallengeValue(s, 'time');
}

const SCORING_UNITS: Record<ChallengeScoring, string> = {
  time: 'KM',
  distance: 'KM',
  score: 'PTS',
  rounds: 'ROUNDS',
};

/** The lanes: values, the unit word and a finish line, even when the call-out set no target. */
export function lanes(f: StageFacts): {
  a: { name: string; value: number; checkedIn: boolean };
  b: { name: string; value: number; checkedIn: boolean };
  unit: string;
  target: number;
} {
  const a = Math.max(0, f.a_progress ?? 0);
  const b = Math.max(0, f.b_progress ?? 0);
  const unit = (f.unit ?? SCORING_UNITS[f.scoring]).toUpperCase();
  // No target (a score or rounds game): the leader fills the lane, so the gap still reads.
  const target = f.target && f.target > 0 ? f.target : Math.max(a, b, 1);
  return {
    a: { name: sideName(f, 'a'), value: a, checkedIn: !!f.a_checked_in },
    b: { name: sideName(f, 'b'), value: b, checkedIn: !!f.b_checked_in },
    unit,
    target,
  };
}

/** "8 s", "3 min", "2 h". */
export function ageWords(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h`;
}

/**
 * How fresh the lanes are and where the numbers come from, said plainly (never colour-only):
 * "Updated 8 s ago · logged by Chimdi, a competitor". Stale numbers say so.
 */
export function freshness(
  f: Pick<StageFacts, 'progress_updated_at' | 'progress_logged_by_name'>,
  serverNowMs: number,
): { text: string; stale: boolean } {
  if (!f.progress_updated_at) {
    return { text: 'Nothing logged yet. The competitors log it as it changes.', stale: false };
  }
  const age = (serverNowMs - Date.parse(f.progress_updated_at)) / 1000;
  const by = f.progress_logged_by_name ? `logged by ${firstName(f.progress_logged_by_name)}, a competitor` : 'logged by a competitor';
  if (age > STALE_AFTER_S) {
    return { text: `Last update ${ageWords(age)} ago · ${by}. It may have moved since.`, stale: true };
  }
  return { text: `Updated ${ageWords(age)} ago · ${by}`, stale: false };
}

/** LOCKED · PREDICTIONS: "The crowd: 46% Chimdi, 54% Marcus. You picked Chimdi." */
export function lockedPredictions(
  f: Pick<StageFacts, 'a_name' | 'b_name' | 'format' | 'prediction_count' | 'prediction_a_pct' | 'prediction_b_pct' | 'my_prediction'>,
): string {
  const count = f.prediction_count ?? 0;
  const mine = f.my_prediction ? ` You picked ${sideName(f, f.my_prediction)}.` : '';
  if (count === 0) return `Nobody picked before it went live.${mine}`;
  if (count < PREDICTION_MIN_COUNT || f.prediction_a_pct === null || f.prediction_b_pct === null) {
    return `${count} ${count === 1 ? 'prediction' : 'predictions'}. The split shows from ${PREDICTION_MIN_COUNT}.${mine}`;
  }
  return `The crowd: ${f.prediction_a_pct}% ${sideName(f, 'a')}, ${f.prediction_b_pct}% ${sideName(f, 'b')}.${mine}`;
}

/** CHEER THEM ON: LET'S GO, RESPECT, HOLD THAT. RUN IT BACK is for after the result. */
export function cheerRows(state: ReactionState) {
  return reactionRows(state).filter((r) => r.value !== ('run_it_back' as ReactionWord));
}

// Submitting a result ------------------------------------------------------------------------------

/** What one side's number is called, for labels and the confirm button. */
export function valueWord(scoring: ChallengeScoring): { one: string; both: string } {
  switch (scoring) {
    case 'time':
      return { one: 'time', both: 'both times' };
    case 'distance':
      return { one: 'distance', both: 'both distances' };
    case 'rounds':
      return { one: 'rounds', both: 'the rounds' };
    default:
      return { one: 'score', both: 'the score' };
  }
}

/** The input's hint: "Minutes and seconds, like 22:48." */
export function valueHint(scoring: ChallengeScoring): string {
  switch (scoring) {
    case 'time':
      return 'Minutes and seconds, like 22:48.';
    case 'distance':
      return 'Kilometres, like 5.2.';
    case 'rounds':
      return 'Rounds won, like 3.';
    default:
      return 'Points, like 21.';
  }
}

/** Typed text to the number the server takes (seconds for time). Null when it isn't one. */
export function parseValue(text: string, scoring: ChallengeScoring): number | null {
  const t = text.trim();
  if (!t) return null;
  if (scoring === 'time') {
    if (!/^\d{1,2}(:\d{1,2}){1,2}$/.test(t)) return null;
    const parts = t.split(':').map(Number);
    const [h, m, s] = parts.length === 3 ? parts : [0, parts[0]!, parts[1]!];
    if (m! >= 60 || s! >= 60) return null;
    const total = h! * 3600 + m! * 60 + s!;
    return total > 0 && total <= 99999 ? total : null;
  }
  if (scoring === 'distance') {
    if (!/^\d{1,4}([.,]\d{1,2})?$/.test(t)) return null;
    const n = Number(t.replace(',', '.'));
    return n >= 0 && n <= 99999 ? n : null;
  }
  if (!/^\d{1,5}$/.test(t)) return null;
  const n = Number(t);
  return n <= 99999 ? n : null;
}

export type ResultForm = { a: string; b: string };

/** Both numbers, checked; errors in words per field. */
export function validateResult(
  form: ResultForm,
  scoring: ChallengeScoring,
  names: { a: string; b: string },
): { ok: true; a: number; b: number } | { ok: false; errors: Partial<Record<'a' | 'b', string>> } {
  const a = parseValue(form.a, scoring);
  const b = parseValue(form.b, scoring);
  const errors: Partial<Record<'a' | 'b', string>> = {};
  const word = valueWord(scoring).one;
  if (a === null) errors.a = form.a.trim() ? `That isn't a ${word}. ${valueHint(scoring)}` : `Add ${names.a}'s ${word}.`;
  if (b === null) errors.b = form.b.trim() ? `That isn't a ${word}. ${valueHint(scoring)}` : `Add ${names.b}'s ${word}.`;
  if (a === null || b === null) return { ok: false, errors };
  return { ok: true, a, b };
}

/** A logged progress value: km with one or two decimals, or a whole count. */
export function parseProgress(text: string, scoring: ChallengeScoring, unit: string | null): number | null {
  const decimal = scoring === 'distance' || scoring === 'time' || unit === 'km';
  return parseValue(text, decimal ? 'distance' : 'score');
}

/** A number as shown on these screens (times as 22:48; km as 3.4; counts whole). */
export function showValue(value: number | null | undefined, scoring: ChallengeScoring): string {
  if (value === null || value === undefined) return '–';
  if (scoring === 'distance') return String(Math.round(value * 100) / 100);
  return formatChallengeValue(value, scoring) ?? '–';
}

// Verifying -----------------------------------------------------------------------------------------

/** `challenge_verification().checks` as typed rows, ignoring anything malformed. */
export function readChecks(json: unknown): VerificationCheck[] {
  if (!Array.isArray(json)) return [];
  return json.filter(
    (c): c is VerificationCheck =>
      !!c && typeof c === 'object' && typeof (c as VerificationCheck).name === 'string' &&
      typeof (c as VerificationCheck).done === 'boolean',
  );
}

/** One checklist row: "Marcus confirmed both times · DONE", "Your confirmation · WAITING". */
export function checkRow(check: VerificationCheck, scoring: ChallengeScoring): { text: string; status: 'DONE' | 'WAITING' } {
  const both = valueWord(scoring).both;
  if (check.is_me) {
    return { text: check.done ? `You confirmed ${both}` : 'Your confirmation', status: check.done ? 'DONE' : 'WAITING' };
  }
  const name = firstName(check.name);
  return { text: check.done ? `${name} confirmed ${both}` : `${name}'s confirmation`, status: check.done ? 'DONE' : 'WAITING' };
}

/** The line under VERIFYING. (or the paused headline when a correction is open). */
export function verifyingIntro(p: { disputed: boolean; competitor: boolean; requestedBy: string | null; isMe: boolean }): {
  headline: string;
  body: string;
} {
  if (p.disputed) {
    const who = p.isMe ? 'You' : p.requestedBy ? firstName(p.requestedBy) : 'A competitor';
    return {
      headline: 'ON HOLD.',
      body: `${who} asked for a correction. The result waits until it is settled, and nobody is called the winner yet.`,
    };
  }
  return {
    headline: 'VERIFYING.',
    body: p.competitor
      ? 'You both finished. Ojoro checks both confirmations before anyone is called the winner.'
      : 'Both finished. Ojoro checks both confirmations before anyone is called the winner.',
  };
}

/** The confirm button: CONFIRM BOTH TIMES / CONFIRM THE SCORE. */
export function confirmLabel(scoring: ChallengeScoring): string {
  return `CONFIRM ${valueWord(scoring).both}`.toUpperCase();
}

/** How a correction is settled, said once under the buttons. */
export const CORRECTION_NOTE =
  'A correction pauses the result. Either of you can send corrected numbers, or an organizer reviews it within 24 hours.';

export const CORRECTION_NOTE_MAX = 280;

// Result ---------------------------------------------------------------------------------------------

/** RecapPoster's numbers: both results and how many watched. */
export function resultStats(f: StageFacts): { value: string; label: string }[] {
  const stats = [
    { value: showValue(f.result_a, f.scoring), label: sideName(f, 'a').toUpperCase() },
    { value: showValue(f.result_b, f.scoring), label: sideName(f, 'b').toUpperCase() },
  ];
  const watched = f.watched_count ?? 0;
  if (watched > 0) stats.push({ value: String(watched), label: 'WATCHED' });
  return stats;
}

/** The story under the numbers: the note the result came with, then the margin. */
export function resultStory(f: Pick<StageFacts, 'result_note' | 'margin' | 'scoring' | 'is_draw'>): string {
  const note = f.result_note?.trim();
  const tail = f.is_draw
    ? 'Dead level.'
    : f.margin !== null && f.margin !== undefined
      ? `${formatMargin(f.margin, f.scoring)}.`
      : '';
  const noteWithStop = note ? (/[.!?]$/.test(note) ? note : `${note}.`) : '';
  return [noteWithStop, tail].filter(Boolean).join(' ');
}

/** "Chimdi by 43 seconds" (read aloud with the poster). */
export function resultLine(f: StageFacts): string | undefined {
  if (f.is_draw) return 'A draw';
  if (!f.winner_side || f.margin === null) return undefined;
  return `${sideName(f, f.winner_side)} by ${formatMargin(f.margin, f.scoring)}`;
}

/**
 * PREDICTIONS on the result: the crowd's call and yours. Null headline when there was no call
 * (a draw, a tie, or fewer than the threshold).
 */
export function predictionOutcome(f: StageFacts): { headline: string | null; line: string } {
  const count = f.prediction_count ?? 0;
  const mine =
    f.my_prediction && f.winner_side
      ? f.my_prediction === f.winner_side
        ? ' You called it.'
        : ` You picked ${sideName(f, f.my_prediction)}.`
      : '';
  if (f.is_draw) return { headline: null, line: "A draw, so nobody's pick won." };
  if (f.crowd_called_it === null || !f.crowd_pick_side || f.crowd_pick_pct === null) {
    return {
      headline: null,
      line: count < PREDICTION_MIN_COUNT
        ? `${count} ${count === 1 ? 'prediction' : 'predictions'}: too few to call it.${mine}`
        : `The crowd split evenly.${mine}`,
    };
  }
  return {
    headline: f.crowd_called_it ? 'THE CROWD CALLED IT.' : 'THE CROWD GOT IT WRONG.',
    line: `${f.crowd_pick_pct}% picked ${sideName(f, f.crowd_pick_side)}.${mine}`,
  };
}

/** The rivalry row, from the viewer's side when they compete: "5–3", "You lead after 9 meetings". */
export function rivalryRow(f: StageFacts): { record: string; title: string; line: string } {
  const aw = f.rivalry_a_wins ?? 0;
  const bw = f.rivalry_b_wins ?? 0;
  const draws = f.rivalry_draws ?? 0;
  const meetings = f.rivalry_meetings ?? aw + bw + draws;
  const mine = f.is_competitor ? f.my_side : null;
  const meetingsWord = `${meetings} ${meetings === 1 ? 'meeting' : 'meetings'}`;
  const drawWord = draws > 0 ? `, ${draws} ${draws === 1 ? 'draw' : 'draws'}` : '';
  if (mine) {
    const me = mine === 'a' ? aw : bw;
    const them = mine === 'a' ? bw : aw;
    const lead = me > them ? 'You lead' : me < them ? `${sideName(f, other(mine))} leads` : 'Level';
    return {
      record: `${me}–${them}`,
      title: `Rivalry with ${sideName(f, other(mine))}`,
      line: `${lead} after ${meetingsWord}${drawWord}`,
    };
  }
  const lead = aw > bw ? `${sideName(f, 'a')} leads` : aw < bw ? `${sideName(f, 'b')} leads` : 'Level';
  return {
    record: `${aw}–${bw}`,
    title: `${sideName(f, 'a')} vs ${sideName(f, 'b')}`,
    line: `${lead} after ${meetingsWord}${drawWord}`,
  };
}

/** How the result was verified, in words for the recap's foot. */
export function verifiedBy(source: string | null): string {
  if (source === 'organizer_review') return 'Verified by an organizer review.';
  if (source === 'unanswered_auto_confirmed') {
    return `Confirmed after ${RESULT_AUTO_CONFIRM_HOURS} hours without an answer.`;
  }
  return 'Verified: both competitors confirmed the numbers.';
}

/**
 * When an unanswered result becomes final on its own (RESULT_AUTO_CONFIRM_HOURS after it was sent):
 * "Final at Sat 9:23 unless you confirm or ask for a correction." Null while a correction is open.
 */
export function autoConfirmLine(
  autoConfirmsAt: string | null,
  timeZone: string | undefined,
  p: { iNeedToConfirm: boolean; other: string | null },
): string | null {
  if (!autoConfirmsAt) return null;
  const at = weekdayClock(autoConfirmsAt, timeZone);
  if (p.iNeedToConfirm) return `Final at ${at} unless you confirm or ask for a correction.`;
  return `Final at ${at} unless ${p.other ?? 'the other side'} confirms or asks for a correction.`;
}

/** The share text for the recap (no place beyond what's public, no watchers list). */
export function recapShareText(f: StageFacts): string {
  const head = f.is_draw || !f.winner_side ? `${matchOverline(f)}: a draw.` : `${sideName(f, f.winner_side)} wins ${f.title}.`;
  return `${head} ${showValue(f.result_a, f.scoring)} ${sideName(f, 'a')}, ${showValue(f.result_b, f.scoring)} ${sideName(f, 'b')}. On Ojoro.`;
}
