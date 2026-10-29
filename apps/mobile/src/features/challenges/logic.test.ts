import { describe, expect, it } from 'vitest';

import {
  ageWords,
  attribution,
  audienceWords,
  callOutLine,
  callOutStrips,
  closedWords,
  composerArgs,
  composerSummary,
  counterArgs,
  counterDraft,
  courseWords,
  dayAndMinute,
  dayChoices,
  defaultScoring,
  eventStrip,
  formatWords,
  hasErrors,
  headerOverline,
  incomingCard,
  initialComposer,
  leadingDay,
  opponentLabel,
  parseTarget,
  posterStatus,
  posterWhen,
  replyFor,
  orderRivalries,
  rivalryModel,
  rivalryStrip,
  ruleRows,
  runsOutWords,
  shortName,
  startLine,
  startsAtFor,
  targetField,
  targetWords,
  timeChoices,
  timeChoicesFor,
  validateComposer,
  verifiedByWords,
  type CallOutFacts,
  type CallOutRowFacts,
  type ComposerState,
  type EventRowFacts,
  type RivalryRowFacts,
} from './logic';

const TZ = 'America/Toronto';
// Wed 9 Oct 2024, 12:00 in Montréal.
const NOW = new Date('2024-10-09T16:00:00Z');
const now = NOW.getTime();
// Sat 12 Oct 2024, 9:00 in Montréal.
const SAT_9 = '2024-10-12T13:00:00.000Z';

const facts = (over: Partial<CallOutFacts> = {}): CallOutFacts => ({
  id: 'co1',
  status: 'proposed',
  format: 'person_vs_person',
  sport_name: 'Run',
  title: '5K',
  scoring: 'time',
  target: 5,
  unit: 'km',
  place_id: 'p1',
  place_name: 'Mount Royal loop',
  place_area: 'Plateau',
  course_note: 'Mount Royal loop, 5.0 km, from the Cartier monument',
  starts_at: SAT_9,
  time_zone: TZ,
  message: 'Saturday. Mount Royal. Bring your legs.',
  audience: 'public',
  verification: 'participant_confirmation',
  side_size: 1,
  is_open: false,
  challenger_id: 'u-marcus',
  challenger_name: 'Marcus T',
  opponent_id: 'u-chimdi',
  opponent_name: 'Chimdi O',
  is_mine: false,
  can_answer: true,
  games_together: 12,
  rivalry_id: 'r1',
  rivalry_challenger_wins: 3,
  rivalry_opponent_wins: 4,
  rivalry_draws: 0,
  countered_from: null,
  counter_id: null,
  rematch_of_event_id: null,
  event_id: null,
  expires_at: '2024-10-11T16:00:00Z',
  created_at: '2024-10-09T14:00:00Z',
  ...over,
});

describe('words', () => {
  it('shortens names to the first word, but not crews', () => {
    expect(shortName('Marcus T')).toBe('Marcus');
    expect(shortName('Plateau Crew', true)).toBe('Plateau Crew');
    expect(shortName('  ')).toBe('Someone');
    expect(shortName(null)).toBe('Someone');
  });

  it('says how long ago in overline words', () => {
    expect(ageWords('2024-10-09T15:59:30Z', now)).toBe('JUST NOW');
    expect(ageWords('2024-10-09T15:55:00Z', now)).toBe('5 MIN AGO');
    expect(ageWords('2024-10-09T14:00:00Z', now)).toBe('2H AGO');
    expect(ageWords('2024-10-06T16:00:00Z', now)).toBe('3D AGO');
  });

  it('writes starts as the designs do', () => {
    expect(startLine(SAT_9, TZ)).toBe('Sat 12 Oct, 9:00');
    expect(posterWhen(SAT_9, TZ)).toBe('Sat 12 Oct · 9:00');
    expect(startLine(SAT_9)).toBe('Sat 12 Oct, 9:00');
  });

  it('maps every status to a poster word', () => {
    expect(posterStatus('proposed')).toBe('PENDING');
    expect(posterStatus('accepted')).toBe('ACCEPTED');
    expect(posterStatus('countered')).toBe('COUNTERED');
    expect(posterStatus('declined')).toBe('DECLINED');
    expect(posterStatus('withdrawn')).toBe('WITHDRAWN');
    expect(posterStatus('expired')).toBe('EXPIRED');
  });

  it('writes targets with their unit', () => {
    expect(targetWords(5, 'km')).toBe('5.0 km');
    expect(targetWords(30, 'min')).toBe('30 min');
    expect(targetWords(1, 'rounds')).toBe('1 round');
    expect(targetWords(2.5, 'points')).toBe('2.5 points');
    expect(targetWords(3, null)).toBe('3');
    expect(targetWords(null, 'km')).toBeNull();
    expect(targetWords(0, 'km')).toBeNull();
  });
});

describe('the Call-Out screen', () => {
  it('builds THE RULES in order, with no stakes', () => {
    expect(ruleRows(facts())).toEqual([
      { label: 'FORMAT', value: 'Person vs person · run' },
      { label: 'COURSE', value: 'Mount Royal loop, 5.0 km, from the Cartier monument' },
      { label: 'START', value: 'Sat 12 Oct, 9:00' },
      { label: 'VERIFIED BY', value: 'Both of you confirm the result' },
      { label: 'AUDIENCE', value: 'Public. People can follow, predict and back.' },
      { label: 'STAKES', value: 'None. Bragging rights only.' },
    ]);
  });

  it('describes crews, devices, audiences and a missing course', () => {
    expect(formatWords({ format: 'crew_vs_crew', side_size: 5, sport_name: 'Football' })).toBe('Crew vs crew · 5 a side · football');
    expect(formatWords({ format: 'crew_vs_crew', side_size: null, sport_name: null })).toBe('Crew vs crew · 5 a side');
    expect(verifiedByWords({ verification: 'device', format: 'person_vs_person' })).toBe('GPS watch data, then both of you confirm');
    expect(verifiedByWords({ verification: 'participant_confirmation', format: 'crew_vs_crew' })).toBe('Both captains confirm the result');
    expect(audienceWords({ audience: 'friends', format: 'person_vs_person' })).toMatch(/played with/);
    expect(audienceWords({ audience: 'participants', format: 'person_vs_person' })).toBe('Just the two of you. No crowd.');
    expect(audienceWords({ audience: 'participants', format: 'crew_vs_crew' })).toBe('Just the two crews. No crowd.');
    expect(courseWords({ place_name: null, place_area: 'Plateau', target: null, unit: null, course_note: null })).toBe(
      'Plateau. Agree the spot in the build-up.',
    );
    expect(courseWords({ place_name: null, place_area: null, target: null, unit: null, course_note: ' ' })).toBe('Agree it in the build-up.');
    expect(courseWords({ place_name: 'Mount Royal loop', place_area: null, target: 5, unit: 'km', course_note: null })).toBe('Mount Royal loop, 5.0 km');
  });

  it('attributes the line with games together and the challenger-side record', () => {
    expect(attribution(facts())).toBe('Marcus T · 12 games together · rivalry 3–4');
    expect(attribution(facts({ games_together: 1, rivalry_draws: 1 }))).toBe('Marcus T · 1 game together · rivalry 3–4');
    expect(attribution(facts({ games_together: null, rivalry_id: null, rematch_of_event_id: 'e0' }))).toBe('Marcus T · rematch');
    expect(attribution(facts({ games_together: 0, rivalry_challenger_wins: 0, rivalry_opponent_wins: 0, countered_from: 'co0' }))).toBe(
      'Marcus T · counter',
    );
    expect(attribution(facts({ challenger_name: ' ' }))).toMatch(/^Someone/);
  });

  it('names the header and the opponent', () => {
    expect(headerOverline(facts(), now)).toBe('RECEIVED 2H AGO');
    expect(headerOverline(facts({ is_mine: true }), now)).toBe('SENT 2H AGO');
    expect(headerOverline(facts({ is_open: true }), now)).toBe('OPEN CALL-OUT · 2H AGO');
    expect(opponentLabel(facts({ opponent_name: null }))).toBe('Anyone');
    expect(opponentLabel(facts({ opponent_name: null, format: 'crew_vs_crew' }))).toBe('Any crew');
  });

  it('picks the reply for each state', () => {
    expect(replyFor(facts())).toBe('answer');
    expect(replyFor(facts({ is_open: true }))).toBe('answer_open');
    expect(replyFor(facts({ is_mine: true, can_answer: false }))).toBe('waiting');
    expect(replyFor(facts({ can_answer: false }))).toBe('watching');
    expect(replyFor(facts({ status: 'accepted', event_id: 'e1' }))).toBe('event');
    expect(replyFor(facts({ status: 'accepted' }))).toBe('closed');
    expect(replyFor(facts({ status: 'countered' }))).toBe('countered');
    expect(replyFor(facts({ status: 'declined' }))).toBe('closed');
  });

  it('says what happened without blame', () => {
    expect(closedWords(facts({ status: 'accepted', is_mine: true }), now)).toBe('Chimdi accepted. The event is set.');
    expect(closedWords(facts({ status: 'accepted' }), now)).toBe('Accepted. The event is set.');
    expect(closedWords(facts({ status: 'countered', is_mine: true }), now)).toBe('Chimdi countered with new terms.');
    expect(closedWords(facts({ status: 'countered' }), now)).toBe('You countered with new terms.');
    expect(closedWords(facts({ status: 'declined', is_mine: true }), now)).toBe('Chimdi passed on this one.');
    expect(closedWords(facts({ status: 'declined' }), now)).toBe('You passed on this one.');
    expect(closedWords(facts({ status: 'withdrawn', is_mine: true }), now)).toBe('You took this Call-Out back.');
    expect(closedWords(facts({ status: 'withdrawn' }), now)).toBe('Marcus took this Call-Out back.');
    expect(closedWords(facts({ status: 'expired' }), now)).toMatch(/ran out of time/);
    expect(closedWords(facts({ is_mine: true }), now)).toBe('Waiting on Chimdi. It runs out Fri at 12:00.');
    expect(closedWords(facts({ is_open: true, time_zone: null }), now)).toBe('Waiting on someone to accept.');
  });

  it('says when a call-out runs out', () => {
    expect(runsOutWords('2024-10-09T22:00:00Z', now, TZ)).toBe('today at 18:00');
    expect(runsOutWords('2024-10-10T13:00:00Z', now, TZ)).toBe('tomorrow at 9:00');
    expect(runsOutWords('2024-10-25T13:00:00Z', now)).toBe('Fri 25 Oct');
  });
});

const row = (over: Partial<CallOutRowFacts> = {}): CallOutRowFacts => ({
  id: 'co1',
  status: 'proposed',
  direction: 'incoming',
  format: 'person_vs_person',
  title: '5K',
  starts_at: SAT_9,
  time_zone: TZ,
  place_name: 'Mount Royal loop',
  challenger_name: 'Marcus T',
  opponent_name: 'Chimdi O',
  is_rematch: false,
  is_counter: false,
  event_id: null,
  created_at: '2024-10-09T14:00:00Z',
  ...over,
});

describe('Compete', () => {
  it('shows the newest pending incoming call-out on top', () => {
    const card = incomingCard([row({ id: 'out', direction: 'outgoing' }), row({ id: 'old', status: 'declined' }), row()], now);
    expect(card).toEqual({
      id: 'co1',
      overline: 'INCOMING CALL-OUT · 2H AGO',
      headline: 'MARCUS CALLED YOU OUT.',
      line: '5K · Mount Royal loop · Sat 12 Oct, 9:00',
      accessibilityLabel: 'Incoming call-out from Marcus. 5K · Mount Royal loop · Sat 12 Oct, 9:00. Reply.',
    });
    expect(incomingCard([row({ is_counter: true })], now)?.headline).toBe('MARCUS COUNTERED.');
    expect(incomingCard([row({ is_counter: true })], now)?.overline).toBe('COUNTER · 2H AGO');
    expect(incomingCard([row({ is_rematch: true })], now)?.headline).toBe('MARCUS WANTS A REMATCH.');
    expect(incomingCard([row({ direction: 'outgoing' })], now)).toBeNull();
    expect(callOutLine(row({ place_name: null, time_zone: null }))).toBe('5K · Sat 12 Oct, 9:00');
  });

  it('lists the other call-outs as strips', () => {
    const strips = callOutStrips(
      [
        row(),
        row({ id: 'out', direction: 'outgoing', challenger_name: 'Chimdi O', opponent_name: 'Sam K' }),
        row({ id: 'acc', status: 'accepted', event_id: 'e9', is_rematch: true }),
        row({ id: 'open', direction: 'outgoing', opponent_name: null, place_name: null, is_counter: true }),
        row({ id: 'crew', direction: 'outgoing', format: 'crew_vs_crew', opponent_name: null, time_zone: null }),
      ],
      'co1',
      now,
    );
    expect(strips.map((s) => s.id)).toEqual(['out', 'acc', 'open', 'crew']);
    expect(callOutStrips([row({ id: 'acc', status: 'accepted', event_id: 'e9' })], null, now, new Set(['e9']))).toEqual([]);
    expect(strips[0]).toMatchObject({
      leading: 'SAT',
      title: 'You called out Sam · 5K',
      meta: 'Mount Royal loop · Sent 2h ago',
      trailing: { kind: 'badge', word: 'PENDING', tone: 'neutral' },
      href: '/challenge/out',
    });
    expect(strips[1]).toMatchObject({
      title: 'Marcus called you out · 5K',
      meta: 'Rematch · Mount Royal loop · Received 2h ago',
      trailing: { kind: 'badge', word: 'ACCEPTED', tone: 'signal' },
      href: '/event/e9',
    });
    expect(strips[2]?.title).toBe('You called out anyone · 5K');
    expect(strips[2]?.meta).toBe('Counter · Sent 2h ago');
    expect(strips[3]?.title).toBe('You called out any crew · 5K');
  });

  it('writes the leading day', () => {
    expect(leadingDay('2024-10-09T22:00:00Z', now, TZ).text).toBe('TODAY');
    expect(leadingDay(SAT_9, now, TZ)).toEqual({ text: 'SAT', label: 'Sat 12 Oct' });
    expect(leadingDay('2024-10-25T13:00:00Z', now).text).toBe('25 OCT');
  });

  const ev = (over: Partial<EventRowFacts> = {}): EventRowFacts => ({
    event_id: 'e1',
    stage: 'days',
    relation: 'competitor',
    format: 'person_vs_person',
    title: '5K',
    starts_at: SAT_9,
    time_zone: TZ,
    a_name: 'Chimdi O',
    b_name: 'Marcus T',
    side_size: 1,
    follower_count: 142,
    live_period: null,
    scoring: 'time',
    target: 5,
    winner_side: null,
    my_side: 'a',
    ...over,
  });

  it('builds YOUR EVENTS rows like the design', () => {
    expect(eventStrip(ev(), now)).toEqual({
      id: 'e1',
      leading: 'SAT',
      leadingLabel: 'Sat 12 Oct',
      title: 'Chimdi vs Marcus · 5K',
      meta: 'Build-up · 142 following',
      trailing: { kind: 'badge', word: '3 DAYS', tone: 'signal' },
      href: '/event/e1',
    });
    const crew = eventStrip(
      ev({ format: 'crew_vs_crew', stage: 'accepted', a_name: 'Thursday FC', b_name: 'Plateau Crew', side_size: 5, starts_at: '2024-10-13T13:00:00Z' }),
      now,
    );
    expect(crew).toMatchObject({
      leading: 'SUN',
      title: 'Thursday FC vs Plateau Crew',
      meta: 'Crew-vs-Crew · 5 a side',
      trailing: { kind: 'badge', word: 'ACCEPTED', tone: 'neutral' },
    });
    const live = eventStrip(
      ev({ stage: 'live', relation: 'following', a_name: 'Ife', b_name: 'Sam', title: 'sparring', scoring: 'rounds', target: 3, live_period: 2 }),
      now,
    );
    expect(live).toMatchObject({ leading: 'NOW', title: 'Ife vs Sam · sparring', meta: 'You follow · round 2 of 3', trailing: { kind: 'live' } });
    expect(eventStrip(ev({ stage: 'live', live_period: 2, scoring: 'time' }), now).meta).toBe('Live · part 2');
    expect(eventStrip(ev({ my_side: 'b', a_name: 'Marcus T', b_name: 'Chimdi O' }), now).title).toBe('Chimdi vs Marcus · 5K');
  });

  it('badges every stage in words', () => {
    const word = (over: Partial<EventRowFacts>) => {
      const t = eventStrip(ev(over), now).trailing;
      return t.kind === 'badge' ? t.word : 'LIVE';
    };
    expect(word({ starts_at: '2024-10-10T13:00:00Z' })).toBe('TOMORROW');
    expect(word({ stage: 'today' })).toBe('TODAY');
    expect(word({ stage: 'soon' })).toBe('TODAY');
    expect(word({ stage: 'verifying' })).toBe('VERIFYING');
    expect(word({ stage: 'disputed' })).toBe('CORRECTION');
    expect(word({ stage: 'cancelled' })).toBe('CALLED OFF');
    expect(word({ stage: 'complete', winner_side: 'a' })).toBe('WON');
    expect(word({ stage: 'complete', winner_side: 'b' })).toBe('LOST');
    expect(word({ stage: 'complete', winner_side: null })).toBe('DRAW');
    expect(word({ stage: 'complete', winner_side: 'a', my_side: null, relation: 'following' })).toBe('FINAL');
    expect(eventStrip(ev({ stage: 'complete', winner_side: 'a', time_zone: null }), now).meta).toBe('Final');
  });

  const riv = (over: Partial<RivalryRowFacts> = {}): RivalryRowFacts => ({
    rivalry_id: 'r1',
    kind: 'people',
    a_name: 'Chimdi O',
    b_name: 'Marcus T',
    a_wins: 4,
    b_wins: 3,
    draws: 1,
    meetings: 8,
    form: ['a', 'b', 'a', 'd', 'b', 'a', 'b', 'a'],
    next_title: '5K',
    next_starts_at: SAT_9,
    next_time_zone: TZ,
    ...over,
  });

  it('turns a rivalry row into the Rivalry component and a strip', () => {
    expect(rivalryModel(riv())).toEqual({
      id: 'r1',
      a: { name: 'Chimdi' },
      b: { name: 'Marcus' },
      record: { a: 4, b: 3, draws: 1 },
      history: ['a', 'b', 'a', 'd', 'b', 'a', 'b', 'a'],
      next: '5K · Sat 12 Oct',
    });
    expect(rivalryModel(riv({ form: null, next_title: null, kind: 'crews', a_name: 'Plateau Crew' })).a.name).toBe('Plateau Crew');
    expect(rivalryModel(riv({ next_time_zone: null })).next).toBe('5K · Sat 12 Oct');
    expect(rivalryStrip(riv())).toMatchObject({
      leading: '4–3',
      title: 'Chimdi vs Marcus',
      meta: '8 meetings · 1 drawn · next 5K · Sat 12 Oct',
      href: '/rivalry/r1',
    });
    expect(rivalryStrip(riv({ meetings: 1, draws: 0, next_title: null })).meta).toBe('1 meeting');
    const fresh = riv({ rivalry_id: 'r0', meetings: 0 });
    expect(orderRivalries([fresh, riv()]).map((r) => r.rivalry_id)).toEqual(['r1', 'r0']);
    expect(orderRivalries([riv(), fresh]).map((r) => r.rivalry_id)).toEqual(['r1', 'r0']);
    expect(orderRivalries([fresh]).map((r) => r.rivalry_id)).toEqual(['r0']);
  });
});

describe('when', () => {
  it('offers two weeks of days and half-hour times', () => {
    const days = dayChoices(NOW, TZ);
    expect(days).toHaveLength(14);
    expect(days.slice(0, 3).map((d) => d.label)).toEqual(['Today', 'Tomorrow', 'Fri 11']);
    expect(timeChoices()[0]).toEqual({ minute: 360, label: '6 AM' });
    expect(timeChoices().at(-1)).toEqual({ minute: 1290, label: '9:30 PM' });
    expect(dayChoices(NOW).length).toBe(14);
  });

  it('drops times too soon to call someone out', () => {
    const today = timeChoicesFor(0, NOW, TZ);
    expect(today[0]?.minute).toBe(13 * 60 + 30);
    expect(timeChoicesFor(1, NOW)).toHaveLength(32);
  });

  it('round-trips a start to a day and minute', () => {
    expect(startsAtFor(3, 540, NOW, TZ).toISOString()).toBe(SAT_9);
    expect(dayAndMinute(SAT_9, NOW, TZ)).toEqual({ dayOffset: 3, minuteOfDay: 540 });
    expect(dayAndMinute(SAT_9, NOW)).toEqual({ dayOffset: 3, minuteOfDay: 540 });
  });
});

describe('scoring', () => {
  it('asks for the target in the right unit', () => {
    expect(targetField('time').unit).toBe('km');
    expect(targetField('distance').unit).toBe('min');
    expect(targetField('rounds').unit).toBe('rounds');
    expect(targetField('score').unit).toBe('points');
  });

  it('defaults endurance sports to time', () => {
    expect(defaultScoring('running')).toBe('time');
    expect(defaultScoring('football')).toBe('score');
    expect(defaultScoring(null)).toBe('time');
  });

  it('parses targets', () => {
    expect(parseTarget('')).toBeNull();
    expect(parseTarget('5')).toBe(5);
    expect(parseTarget('2,5')).toBe(2.5);
    expect(parseTarget('five')).toBeNaN();
  });
});

describe('the composer', () => {
  const valid = (over: Partial<ComposerState> = {}): ComposerState => ({
    ...initialComposer({ kind: 'person', id: 'u-chimdi', name: 'Chimdi O' }),
    sportId: 'running',
    title: ' 5K ',
    dayOffset: 3,
    minuteOfDay: 540,
    ...over,
  });

  it('asks for what is missing, in words', () => {
    const e = validateComposer(initialComposer(), NOW, TZ);
    expect(Object.keys(e).sort()).toEqual(['sport', 'target', 'time', 'title']);
    expect(validateComposer(valid({ target: { kind: 'crew', id: null, name: null } }), NOW).crew).toBe('Pick the crew you speak for.');
    expect(validateComposer(valid({ title: 'x'.repeat(25) }), NOW, TZ).title).toMatch(/under 24/);
    expect(validateComposer(valid({ target_text: 'far' }), NOW, TZ).target_text).toMatch(/number/);
    expect(validateComposer(valid({ target_text: '0' }), NOW, TZ).target_text).toMatch(/number/);
    expect(validateComposer(valid({ dayOffset: 0, minuteOfDay: 12 * 60 + 30 }), NOW, TZ).time).toMatch(/an hour/);
    expect(validateComposer(valid({ courseNote: 'x'.repeat(141) }), NOW, TZ).course).toMatch(/140/);
    expect(validateComposer(valid({ message: 'x'.repeat(141) }), NOW, TZ).message).toMatch(/140/);
    expect(hasErrors(validateComposer(valid(), NOW, TZ))).toBe(false);
  });

  it('refuses a start more than 90 days out', () => {
    expect(validateComposer(valid({ dayOffset: 95 }), NOW, TZ).time).toMatch(/90 days/);
  });

  it('builds create_call_out arguments for a person', () => {
    expect(composerArgs(valid({ target_text: '5', placeId: 'p1', courseNote: ' from Cartier ', message: ' Bring your legs. ' }), NOW, TZ)).toEqual({
      p_sport_id: 'running',
      p_title: '5K',
      p_scoring: 'time',
      p_starts_at: SAT_9,
      p_audience: 'public',
      p_opponent_id: 'u-chimdi',
      p_target: 5,
      p_unit: 'km',
      p_place_id: 'p1',
      p_course_note: 'from Cartier',
      p_message: 'Bring your legs.',
    });
    expect(composerArgs(initialComposer(), NOW, TZ)).toBeNull();
  });

  it('builds crew and open call-outs', () => {
    const crewArgs = composerArgs(
      valid({ target: { kind: 'crew', id: 'c2', name: 'Plateau Crew' }, myCrewId: 'c1', sideSize: 14 }),
      NOW,
      TZ,
    );
    expect(crewArgs).toMatchObject({ p_challenger_crew_id: 'c1', p_opponent_crew_id: 'c2', p_side_size: 11 });
    expect(crewArgs).not.toHaveProperty('p_opponent_id');
    const openCrew = composerArgs(valid({ target: { kind: 'crew', id: null, name: null }, myCrewId: 'c1', sideSize: 1 }), NOW);
    expect(openCrew).toMatchObject({ p_side_size: 2 });
    expect(openCrew).not.toHaveProperty('p_opponent_crew_id');
    const open = composerArgs(valid({ target: { kind: 'open' } }), NOW, TZ);
    expect(open).not.toHaveProperty('p_opponent_id');
  });

  it('says what happens next', () => {
    expect(composerSummary({ target: { kind: 'person', id: 'u', name: 'Chimdi O' } })).toBe(
      'Chimdi can accept, counter or pass. Accepting creates the Challenge Event. No stakes, ever.',
    );
    expect(composerSummary({ target: { kind: 'open' } })).toMatch(/^Anyone who sees it can accept it/);
    expect(composerSummary({ target: { kind: 'crew', id: null, name: null } })).toMatch(/^Any crew can accept it/);
    expect(composerSummary({ target: { kind: 'crew', id: 'c', name: 'Plateau Crew' } })).toMatch(/^Plateau Crew can accept, counter/);
    expect(composerSummary({ target: null })).toMatch(/^Anyone who sees it/);
  });
});

describe('the counter', () => {
  const f = facts();

  it('starts from the call-out', () => {
    expect(counterDraft(f, NOW)).toEqual({
      dayOffset: 3,
      minuteOfDay: 540,
      title: '5K',
      target_text: '5',
      placeId: 'p1',
      courseNote: 'Mount Royal loop, 5.0 km, from the Cartier monument',
      message: '',
    });
    expect(counterDraft(facts({ target: null, course_note: null, time_zone: null }), NOW).target_text).toBe('');
  });

  it('sends only what changed', () => {
    const d = counterDraft(f, NOW);
    expect(counterArgs(f, { ...d, minuteOfDay: 600, message: ' Ten works better. ' }, NOW)).toEqual({
      ok: true,
      args: { p_starts_at: '2024-10-12T14:00:00.000Z', p_message: 'Ten works better.' },
    });
    expect(counterArgs(f, { ...d, target_text: '10', title: '10K', placeId: 'p2', courseNote: 'from the lookout' }, NOW)).toEqual({
      ok: true,
      args: { p_title: '10K', p_target: 10, p_unit: 'km', p_place_id: 'p2', p_course_note: 'from the lookout' },
    });
    expect(counterArgs(facts({ unit: null, time_zone: null }), { ...d, target_text: '8' }, NOW)).toEqual({
      ok: true,
      args: { p_target: 8, p_unit: 'km' },
    });
  });

  it('refuses a counter that changes nothing, or bad terms', () => {
    const d = counterDraft(f, NOW);
    expect(counterArgs(f, { ...d, message: 'Same again' }, NOW)).toEqual({
      ok: false,
      errors: { nothing: 'Change the time, distance or course to counter.' },
    });
    const bad = counterArgs(
      f,
      { ...d, minuteOfDay: null, title: '', target_text: 'x', courseNote: 'x'.repeat(141), message: 'x'.repeat(141) },
      NOW,
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(['course', 'message', 'target_text', 'time', 'title']);
    const soon = counterArgs(f, { ...d, dayOffset: 0, minuteOfDay: 12 * 60 + 30, title: 'x'.repeat(30) }, NOW);
    expect(soon.ok ? null : soon.errors).toMatchObject({ time: expect.stringMatching(/an hour/), title: expect.stringMatching(/24/) });
  });
});
