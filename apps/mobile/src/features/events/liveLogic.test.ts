import { describe, expect, it } from 'vitest';

import {
  ageWords,
  autoConfirmLine,
  cheerRows,
  checkRow,
  confirmLabel,
  elapsedClock,
  freshness,
  lanes,
  lockedPredictions,
  matchOverline,
  parseProgress,
  parseValue,
  predictionOutcome,
  readChecks,
  recapShareText,
  resultLine,
  resultStats,
  resultStory,
  rivalryRow,
  serverNow,
  showValue,
  sideName,
  validateResult,
  valueHint,
  valueWord,
  verifiedBy,
  verifyingIntro,
  type StageFacts,
} from './liveLogic';

const base: StageFacts = {
  stage: 'live',
  scoring: 'time',
  title: '5K',
  a_name: 'Chimdi O',
  b_name: 'Marcus T',
  server_now: '2026-10-12T13:30:00Z',
  target: 5,
  unit: 'km',
  a_progress: 3.4,
  b_progress: 3.1,
  a_checked_in: true,
  b_checked_in: true,
  live_at: '2026-10-12T13:13:18Z',
  live_period: null,
  progress_updated_at: '2026-10-12T13:29:52Z',
  progress_logged_by_name: 'Chimdi O',
  follower_count: 212,
  watched_count: 212,
  my_side: 'a',
  is_competitor: true,
  is_captain: true,
  prediction_count: 120,
  prediction_a_pct: 46,
  prediction_b_pct: 54,
  my_prediction: 'a',
  result_a: 1368,
  result_b: 1411,
  winner_side: 'a',
  is_draw: false,
  margin: 43,
  result_note: 'Out hard, held it through the last climb on Camillien-Houde',
  result_source: 'participant_confirmation',
  crowd_called_it: false,
  crowd_pick_side: 'b',
  crowd_pick_pct: 54,
  rivalry_a_wins: 5,
  rivalry_b_wins: 3,
  rivalry_draws: 1,
  rivalry_meetings: 9,
};

describe('names and overline', () => {
  it('uses first names for people and whole names for crews', () => {
    expect(sideName(base, 'a')).toBe('Chimdi');
    expect(sideName({ ...base, format: 'crew_vs_crew', a_name: 'Plateau Runners' }, 'a')).toBe('Plateau Runners');
    expect(sideName({ ...base, b_name: '' }, 'b')).toBe('Side');
    expect(matchOverline(base)).toBe('CHIMDI VS MARCUS · 5K');
  });
});

describe('clock and lanes', () => {
  it('runs on the server clock', () => {
    const received = 1_000_000;
    expect(serverNow(base.server_now, received, received + 5000)).toBe(Date.parse(base.server_now) + 5000);
    expect(elapsedClock(base.live_at, Date.parse(base.server_now))).toBe('16:42');
    expect(elapsedClock(null, 0)).toBeNull();
    expect(elapsedClock('2026-10-12T13:31:00Z', Date.parse(base.server_now))).toBe('0:00');
  });

  it('builds lanes with the unit and a finish line', () => {
    const l = lanes(base);
    expect(l.unit).toBe('KM');
    expect(l.target).toBe(5);
    expect(l.a).toEqual({ name: 'Chimdi', value: 3.4, checkedIn: true });
    const score = lanes({ ...base, scoring: 'score', unit: null, target: null, a_progress: 7, b_progress: null, b_checked_in: null });
    expect(score.unit).toBe('PTS');
    expect(score.target).toBe(7);
    expect(score.b).toEqual({ name: 'Marcus', value: 0, checkedIn: false });
    expect(lanes({ ...base, a_progress: null, b_progress: null, target: null }).target).toBe(1);
  });
});

describe('freshness', () => {
  const now = Date.parse(base.server_now);
  it('says how old and who logged it', () => {
    expect(freshness(base, now)).toEqual({ text: 'Updated 8 s ago · logged by Chimdi, a competitor', stale: false });
    expect(freshness({ ...base, progress_logged_by_name: null }, now).text).toContain('logged by a competitor');
  });
  it('says when it is stale', () => {
    const f = freshness({ ...base, progress_updated_at: '2026-10-12T13:25:00Z' }, now);
    expect(f.stale).toBe(true);
    expect(f.text).toBe('Last update 5 min ago · logged by Chimdi, a competitor. It may have moved since.');
  });
  it('says nothing is logged yet', () => {
    expect(freshness({ ...base, progress_updated_at: null }, now).text).toMatch(/^Nothing logged yet/);
  });
  it('words ages', () => {
    expect(ageWords(-3)).toBe('0 s');
    expect(ageWords(59)).toBe('59 s');
    expect(ageWords(61)).toBe('1 min');
    expect(ageWords(7300)).toBe('2 h');
  });
});

describe('locked predictions', () => {
  it('shows the split and your pick', () => {
    expect(lockedPredictions(base)).toBe('The crowd: 46% Chimdi, 54% Marcus. You picked Chimdi.');
  });
  it('holds the split below the threshold', () => {
    expect(lockedPredictions({ ...base, prediction_count: 3, prediction_a_pct: null, my_prediction: null })).toBe(
      '3 predictions. The split shows from 5.',
    );
    expect(lockedPredictions({ ...base, prediction_count: 1, prediction_a_pct: null, my_prediction: null })).toBe(
      '1 prediction. The split shows from 5.',
    );
    expect(lockedPredictions({ ...base, prediction_count: 0, my_prediction: null })).toBe('Nobody picked before it went live.');
  });
});

describe('cheers', () => {
  it('leaves RUN IT BACK for after', () => {
    const rows = cheerRows({ counts: { lets_go: 88, respect: 41, hold_that: 17, run_it_back: 2 }, mine: 'lets_go' });
    expect(rows.map((r) => r.value)).toEqual(['lets_go', 'respect', 'hold_that']);
    expect(rows[0]).toMatchObject({ count: 88, mine: true });
  });
});

describe('result entry', () => {
  it('parses times', () => {
    expect(parseValue('22:48', 'time')).toBe(1368);
    expect(parseValue('1:02:03', 'time')).toBe(3723);
    expect(parseValue('22:61', 'time')).toBeNull();
    expect(parseValue('0:00', 'time')).toBeNull();
    expect(parseValue('22', 'time')).toBeNull();
    expect(parseValue('', 'time')).toBeNull();
  });
  it('parses distances and counts', () => {
    expect(parseValue('5,2', 'distance')).toBe(5.2);
    expect(parseValue('5.25', 'distance')).toBe(5.25);
    expect(parseValue('5.255', 'distance')).toBeNull();
    expect(parseValue('21', 'score')).toBe(21);
    expect(parseValue('2.5', 'rounds')).toBeNull();
    expect(parseProgress('3.4', 'time', 'km')).toBe(3.4);
    expect(parseProgress('7', 'score', null)).toBe(7);
    expect(parseProgress('7.5', 'score', 'points')).toBeNull();
    expect(parseProgress('7.5', 'score', 'km')).toBe(7.5);
  });
  it('validates both sides in words', () => {
    expect(validateResult({ a: '22:48', b: '23:31' }, 'time', { a: 'Chimdi', b: 'Marcus' })).toEqual({ ok: true, a: 1368, b: 1411 });
    const bad = validateResult({ a: '', b: 'abc' }, 'time', { a: 'Chimdi', b: 'Marcus' });
    expect(bad).toEqual({
      ok: false,
      errors: { a: "Add Chimdi's time.", b: "That isn't a time. Minutes and seconds, like 22:48." },
    });
  });
  it('names values per scoring', () => {
    expect(valueWord('distance').both).toBe('both distances');
    expect(valueWord('rounds').one).toBe('rounds');
    expect(valueWord('score').both).toBe('the score');
    expect(valueHint('distance')).toMatch(/Kilometres/);
    expect(valueHint('rounds')).toMatch(/Rounds/);
    expect(valueHint('score')).toMatch(/Points/);
    expect(confirmLabel('time')).toBe('CONFIRM BOTH TIMES');
    expect(confirmLabel('score')).toBe('CONFIRM THE SCORE');
  });
  it('shows values', () => {
    expect(showValue(1368, 'time')).toBe('22:48');
    expect(showValue(3.456, 'distance')).toBe('3.46');
    expect(showValue(21, 'score')).toBe('21');
    expect(showValue(null, 'score')).toBe('–');
  });
});

describe('verifying', () => {
  const checks = [
    { kind: 'confirmation', user_id: 'm', name: 'Marcus T', side: 'b', is_me: false, done: true, done_at: 'x' },
    { kind: 'confirmation', user_id: 'c', name: 'Chimdi O', side: 'a', is_me: true, done: false, done_at: null },
    { nope: true },
    null,
  ];
  it('reads checks and words each', () => {
    const rows = readChecks(checks);
    expect(rows).toHaveLength(2);
    expect(checkRow(rows[0]!, 'time')).toEqual({ text: 'Marcus confirmed both times', status: 'DONE' });
    expect(checkRow(rows[1]!, 'time')).toEqual({ text: 'Your confirmation', status: 'WAITING' });
    expect(checkRow({ ...rows[1]!, done: true }, 'score')).toEqual({ text: 'You confirmed the score', status: 'DONE' });
    expect(checkRow({ ...rows[0]!, done: false }, 'time')).toEqual({ text: "Marcus's confirmation", status: 'WAITING' });
    expect(readChecks('nope')).toEqual([]);
  });
  it('says what is happening', () => {
    expect(verifyingIntro({ disputed: false, competitor: true, requestedBy: null, isMe: false }).headline).toBe('VERIFYING.');
    expect(verifyingIntro({ disputed: false, competitor: false, requestedBy: null, isMe: false }).body).toMatch(/^Both finished/);
    const held = verifyingIntro({ disputed: true, competitor: true, requestedBy: 'Marcus T', isMe: false });
    expect(held.headline).toBe('ON HOLD.');
    expect(held.body).toMatch(/^Marcus asked for a correction/);
    expect(verifyingIntro({ disputed: true, competitor: true, requestedBy: null, isMe: true }).body).toMatch(/^You asked/);
    expect(verifyingIntro({ disputed: true, competitor: true, requestedBy: null, isMe: false }).body).toMatch(/^A competitor/);
  });
});

describe('result', () => {
  it('builds the poster numbers and story', () => {
    expect(resultStats(base)).toEqual([
      { value: '22:48', label: 'CHIMDI' },
      { value: '23:31', label: 'MARCUS' },
      { value: '212', label: 'WATCHED' },
    ]);
    expect(resultStats({ ...base, watched_count: 0 })).toHaveLength(2);
    expect(resultStory(base)).toBe('Out hard, held it through the last climb on Camillien-Houde. 43 seconds.');
    expect(resultStory({ ...base, result_note: 'Close!', margin: null })).toBe('Close!');
    expect(resultStory({ ...base, result_note: null, is_draw: true })).toBe('Dead level.');
    expect(resultLine(base)).toBe('Chimdi by 43 seconds');
    expect(resultLine({ ...base, is_draw: true })).toBe('A draw');
    expect(resultLine({ ...base, winner_side: null })).toBeUndefined();
  });

  it('calls the crowd', () => {
    expect(predictionOutcome(base)).toEqual({ headline: 'THE CROWD GOT IT WRONG.', line: '54% picked Marcus. You called it.' });
    expect(predictionOutcome({ ...base, crowd_called_it: true, crowd_pick_side: 'a', my_prediction: 'b' })).toEqual({
      headline: 'THE CROWD CALLED IT.',
      line: '54% picked Chimdi. You picked Marcus.',
    });
    expect(predictionOutcome({ ...base, crowd_called_it: null, prediction_count: 2, my_prediction: null })).toEqual({
      headline: null,
      line: '2 predictions: too few to call it.',
    });
    expect(predictionOutcome({ ...base, crowd_called_it: null, prediction_count: 1, my_prediction: null }).line).toBe(
      '1 prediction: too few to call it.',
    );
    expect(predictionOutcome({ ...base, crowd_called_it: null }).line).toBe('The crowd split evenly. You called it.');
    expect(predictionOutcome({ ...base, is_draw: true, winner_side: null }).headline).toBeNull();
  });

  it('orients the rivalry to the viewer', () => {
    expect(rivalryRow(base)).toEqual({ record: '5–3', title: 'Rivalry with Marcus', line: 'You lead after 9 meetings, 1 draw' });
    expect(rivalryRow({ ...base, my_side: 'b' })).toEqual({
      record: '3–5',
      title: 'Rivalry with Chimdi',
      line: 'Chimdi leads after 9 meetings, 1 draw',
    });
    expect(rivalryRow({ ...base, rivalry_a_wins: 1, rivalry_b_wins: 1, rivalry_draws: 0, rivalry_meetings: 2 }).line).toBe(
      'Level after 2 meetings',
    );
    const watcher = { ...base, is_competitor: false, my_side: null };
    expect(rivalryRow(watcher)).toEqual({ record: '5–3', title: 'Chimdi vs Marcus', line: 'Chimdi leads after 9 meetings, 1 draw' });
    expect(rivalryRow({ ...watcher, rivalry_a_wins: 0, rivalry_b_wins: 1, rivalry_draws: 2, rivalry_meetings: null }).line).toBe(
      'Marcus leads after 3 meetings, 2 draws',
    );
    expect(rivalryRow({ ...watcher, rivalry_a_wins: 0, rivalry_b_wins: 0, rivalry_draws: 0, rivalry_meetings: 1 }).line).toBe(
      'Level after 1 meeting',
    );
  });

  it('says how it was verified and shares plainly', () => {
    expect(verifiedBy('organizer_review')).toMatch(/organizer/);
    expect(verifiedBy('participant_confirmation')).toMatch(/both competitors/);
    expect(verifiedBy('unanswered_auto_confirmed')).toBe('Confirmed after 48 hours without an answer.');
    expect(recapShareText(base)).toBe('Chimdi wins 5K. 22:48 Chimdi, 23:31 Marcus. On Ojoro.');
    expect(recapShareText({ ...base, is_draw: true, winner_side: null })).toMatch(/: a draw\./);
  });
});

describe('auto-confirm', () => {
  const at = '2026-10-17T13:23:00Z'; // Sat 9:23 in Toronto
  it('says when an unanswered result becomes final', () => {
    expect(autoConfirmLine(at, 'America/Toronto', { iNeedToConfirm: true, other: 'Marcus' })).toBe(
      'Final at Sat 9:23 unless you confirm or ask for a correction.',
    );
    expect(autoConfirmLine(at, 'America/Toronto', { iNeedToConfirm: false, other: 'Marcus' })).toBe(
      'Final at Sat 9:23 unless Marcus confirms or asks for a correction.',
    );
    expect(autoConfirmLine(at, 'America/Toronto', { iNeedToConfirm: false, other: null })).toMatch(/the other side/);
    expect(autoConfirmLine(null, 'America/Toronto', { iNeedToConfirm: true, other: null })).toBeNull();
  });
});
