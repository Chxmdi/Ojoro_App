import type {
  HostNeedsYouItem,
  HostWeekItem,
  JoinRequestRow,
  RosterRow,
  SeriesSession,
  SeriesView,
  SessionView,
} from '@ojoro/contracts';
import { describe, expect, it } from 'vitest';

import {
  addDays,
  addSpotLabel,
  approvalIntro,
  canCheckIn,
  checkInNote,
  crewsRuleBody,
  dateWeekday,
  decidedText,
  durationChoices,
  durationLabel,
  formSettings,
  longDate,
  monthDay,
  moveDown,
  moveUp,
  needsYouRow,
  opensChoices,
  opensHint,
  opensLabel,
  parsePrice,
  paymentDue,
  playersHint,
  plural,
  positionWord,
  requestArea,
  requestContext,
  requestFacts,
  requestsCountLabel,
  requestsHeadline,
  rosterBadge,
  rosterCountLabel,
  rosterMeta,
  saveNote,
  seriesForm,
  seriesIntro,
  sessionHeadline,
  sessionLine,
  sessionOverline,
  sessionRow,
  settlement,
  skippingHint,
  startsIn,
  startTimeChoices,
  statValue,
  toggleDay,
  untilChoices,
  untilLabel,
  validateSeries,
  wallClock,
  waitlistNote,
  weekHeadline,
  weekRow,
  withoutWeekday,
  zonedDate,
  zonedMonthDay,
} from './logic';

const TZ = 'America/Toronto';
const P = 'prog';
// Tue Nov 3 2026, 6:40 PM in Montréal (EST, UTC−5).
const NOW = new Date('2026-11-03T23:40:00Z');
const START = '2026-11-04T00:30:00Z'; // 7:30 PM
const END = '2026-11-04T02:00:00Z'; // 9:00 PM

describe('words', () => {
  it('counts', () => {
    expect(plural(1, 'session')).toBe('1 session');
    expect(plural(3, 'person', 'people')).toBe('3 people');
  });
  it('dates', () => {
    expect(monthDay('2026-10-13')).toBe('Oct 13');
    expect(longDate('2027-03-30')).toBe('March 30, 2027');
    expect(dateWeekday('2026-10-13')).toBe('TUE');
    expect(dateWeekday('2026-11-08')).toBe('SUN');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(zonedMonthDay('2026-10-15T23:00:00Z', TZ)).toBe('Oct 15');
    expect(zonedDate(NOW, TZ)).toBe('2026-11-03');
  });
});

describe('HostHome', () => {
  it('headlines the week in counts', () => {
    expect(
      weekHeadline({ sessions_this_week: 3, ops_items_this_week: 1, spots_taken: 31, spots_total: 36, waiting: 3 }),
    ).toBe('3 sessions and a league round. 31 of 36 spots taken, 3 people waiting.');
    expect(
      weekHeadline({ sessions_this_week: 1, ops_items_this_week: 2, spots_taken: 4, spots_total: 10, waiting: 0 }),
    ).toBe('1 session and 2 league rounds. 4 of 10 spots taken.');
    expect(weekHeadline({ sessions_this_week: 0, ops_items_this_week: 1, spots_taken: 0, spots_total: 0, waiting: 0 })).toBe(
      'a league round.',
    );
    expect(weekHeadline({ sessions_this_week: 0, ops_items_this_week: 0, spots_taken: 0, spots_total: 0, waiting: 0 })).toMatch(
      /^Nothing on this week/,
    );
  });

  it('drops the weekday the row already shows', () => {
    expect(withoutWeekday('Tuesday 7-a-side', 2)).toBe('7-a-side');
    expect(withoutWeekday('Sunday beginners', 0)).toBe('Beginners');
    expect(withoutWeekday('Tuesday', 2)).toBe('Tuesday');
    expect(withoutWeekday('Mixed 5s', 4)).toBe('Mixed 5s');
    expect(withoutWeekday('Mixed', 9)).toBe('Mixed');
  });

  const need = (over: Partial<HostNeedsYouItem>): HostNeedsYouItem => ({
    kind: 'join_requests',
    session_id: 's1',
    object_id: null,
    name: 'Sunday beginners',
    starts_at: START,
    count: 2,
    user_names: ['Grace N', 'Omar S'],
    detail: { approval_required: true },
    sort_at: START,
    ...over,
  });

  it('turns NEEDS YOU items into one row and one button each', () => {
    expect(needsYouRow(P, need({}), 0)).toMatchObject({
      title: '2 people asked to join',
      meta: 'Sunday beginners · approval on',
      action: 'REVIEW',
      href: '/host/prog/session/s1/requests',
    });
    expect(needsYouRow(P, need({ count: 1, detail: { approval_required: false } }), 0).title).toBe('1 person asked to join');
    expect(needsYouRow(P, need({ session_id: null }), 0).href).toBeNull();
    expect(needsYouRow(P, need({ kind: 'waitlist_choice', count: 1, detail: { waiting: 3 } }), 1)).toMatchObject({
      title: '1 spot to fill',
      action: 'CHOOSE',
      href: '/host/prog/session/s1',
    });
    expect(
      needsYouRow(P, need({ kind: 'refund_request', count: 1, detail: { person_name: 'Lena R', what: 'monthly membership' } }), 2),
    ).toMatchObject({ title: '1 refund request', meta: 'Lena R · monthly membership', action: 'DECIDE', href: '/host/prog/payments' });
    expect(needsYouRow(P, need({ kind: 'league_result', object_id: 'L', detail: { score_line: 'Thursday FC 4–2 Plateau Crew' } }), 3)).toMatchObject({
      title: 'League result to confirm',
      meta: 'Thursday FC 4–2 Plateau Crew',
      action: 'CONFIRM',
      href: '/host/prog/league/L',
    });
    expect(needsYouRow(P, need({ kind: 'other', count: 3, detail: null }), 4)).toMatchObject({ title: 'Sunday beginners · 3', href: null });
    expect(needsYouRow(P, need({ kind: null, count: 1, name: null, detail: [] }), 5).title).toBe('A session');
  });

  const week = (over: Partial<HostWeekItem>): HostWeekItem => ({
    kind: 'session',
    session_id: 's1',
    series_id: 'se1',
    object_id: 'a1',
    name: 'Tuesday 7-a-side',
    starts_at: START,
    time_zone: TZ,
    status: 'scheduled',
    capacity: 14,
    in_count: 14,
    waitlist_count: 3,
    asking_count: 0,
    price_cents: 800,
    member_price_cents: 0,
    currency: 'CAD',
    approval_required: false,
    members_first: false,
    detail: null,
    ...over,
  });

  it('writes THIS WEEK rows', () => {
    expect(weekRow(P, week({}), TZ)).toMatchObject({
      day: 'TUE',
      title: '7-a-side · 7:30',
      meta: '14 / 14 · 3 waiting · drop-in',
      badge: 'FULL',
      signal: true,
      href: '/host/prog/session/s1',
    });
    expect(weekRow(P, week({ in_count: 8, capacity: 10, waitlist_count: 0, members_first: true, name: 'Mixed 5s' }), TZ).meta).toBe(
      '8 / 10 · members free',
    );
    const asking = weekRow(P, week({ price_cents: 0, in_count: 9, capacity: 12, waitlist_count: 0, asking_count: 2, approval_required: true }), TZ);
    expect(asking).toMatchObject({ meta: '9 / 12 · free · approval on', badge: '2 ASKING', href: '/host/prog/session/s1/requests' });
    expect(weekRow(P, week({ status: 'skipped' }), TZ)).toMatchObject({ meta: 'Skipped this week', badge: 'SKIPPED', href: null });
    expect(weekRow(P, week({ session_id: null, time_zone: null, starts_at: null }), TZ).href).toBeNull();
    expect(
      weekRow(P, week({ kind: 'league', name: 'Winter League', object_id: 'L', detail: { round: 3, fixtures: 3, teams: 6 } }), TZ),
    ).toMatchObject({ title: 'Winter League · round 3', meta: '3 fixtures · 6 teams', badge: 'LEAGUE', href: '/host/prog/league/L' });
    expect(weekRow(P, week({ kind: 'league', object_id: null, detail: {} }), TZ)).toMatchObject({ meta: '', href: null });
  });

  it('shows a dash for stats with no data, and says so', () => {
    expect(statValue(null)).toEqual({ shown: '–', spoken: 'not enough sessions yet' });
    expect(statValue(90.6, '%')).toEqual({ shown: '91%', spoken: '91 percent' });
    expect(statValue(26)).toEqual({ shown: '26', spoken: '26' });
  });
});

const series: SeriesView = {
  series_id: 'se1',
  program_id: P,
  name: 'Tuesday 7-a-side',
  sport_id: 'football',
  place_id: 'pl1',
  place_name: 'Jeanne-Mance Park',
  place_area: 'Plateau',
  time_zone: TZ,
  start_time: '19:30:00',
  duration_minutes: 90,
  capacity: 14,
  level: 'mixed',
  repeat_days: [2],
  starts_on: '2026-03-03',
  until_on: '2027-03-30',
  join_opens_days: 5,
  members_early_hours: 48,
  approval_required: true,
  waitlist_auto_fill: true,
  members_first: true,
  price_cents: 800,
  member_price_cents: 0,
  currency: 'CAD',
  refund_window: 'hours_12',
  teams_note: null,
  kit_note: null,
  version: 3,
  first_session_on: '2026-03-03',
  sessions_run: 31,
  skipped_upcoming: ['2026-12-22', '2026-12-29'],
  applies_from: '2026-10-13',
  people_in_upcoming: 9,
  host_verified: false,
} as unknown as SeriesView;

describe('HostSeries', () => {
  it('loads the form and turns it back into settings', () => {
    const f = seriesForm(series);
    expect(f).toMatchObject({ start_time: '19:30', price: '$8', member_price: 'Included', repeat_days: [2] });
    expect(formSettings({ ...f, name: '  Tue 7s ', price: '8.50', member_price: '$4' })).toMatchObject({
      name: 'Tue 7s',
      price_cents: 850,
      member_price_cents: 400,
      start_time: '19:30',
    });
    expect(seriesForm({ ...series, price_cents: 0, member_price_cents: 300 }).price).toBe('Free');
  });

  it('parses prices', () => {
    expect(parsePrice('')).toBe(0);
    expect(parsePrice('Free')).toBe(0);
    expect(parsePrice('Included')).toBe(0);
    expect(parsePrice('$8')).toBe(800);
    expect(parsePrice('8,5')).toBe(850);
    expect(parsePrice('eight')).toBeNull();
    expect(parsePrice('99999')).toBeNull();
  });

  it('validates in words', () => {
    const f = seriesForm(series);
    expect(validateSeries(f)).toEqual({});
    expect(validateSeries({ ...f, name: ' ', repeat_days: [], price: 'x', member_price: 'y' })).toEqual({
      name: 'Give the series a name.',
      repeat_days: 'Pick at least one day.',
      price: expect.stringMatching(/\$8/),
      member_price: expect.stringMatching(/Included/),
    });
    expect(validateSeries({ ...f, name: 'x'.repeat(61) }).name).toMatch(/60/);
  });

  it('toggles days in order', () => {
    expect(toggleDay([2], 4)).toEqual([2, 4]);
    expect(toggleDay([4, 2], 2)).toEqual([4]);
    expect(toggleDay([5], 1)).toEqual([1, 5]);
  });

  it('writes the intro, hints and save note', () => {
    expect(seriesIntro(series, NOW)).toBe('Every Tuesday since March. Change it once here and every future session follows.');
    expect(seriesIntro({ repeat_days: [4, 2], first_session_on: '2025-05-01' }, NOW)).toMatch(/^Every Tuesday and Thursday since May 2025\./);
    expect(seriesIntro({ repeat_days: [1, 2, 3, 4, 5, 6, 7], first_session_on: null }, NOW)).toMatch(/^Every day\. /);
    expect(playersHint(14)).toBe('7 a side. Ojoro balances teams at check-in.');
    expect(playersHint(15)).toBe('15 players. Ojoro balances teams at check-in.');
    expect(skippingHint(series.skipped_upcoming)).toBe('Skipping Dec 22 and Dec 29.');
    expect(skippingHint([])).toBeUndefined();
    expect(skippingHint(null)).toBeUndefined();
    expect(opensHint({ members_first: true }, 48)).toBe('Members get it 48 hours earlier.');
    expect(opensHint({ members_first: false }, 48)).toBeUndefined();
    expect(saveNote(series)).toBe('Applies from Oct 13. The 9 people already in get one message saying what changed.');
    expect(saveNote({ applies_from: null, people_in_upcoming: 1 })).toBe(
      'Applies to every session from now on. The 1 person already in gets one message saying what changed.',
    );
    expect(saveNote({ applies_from: '2026-10-13', people_in_upcoming: 0 })).toMatch(/Nobody is in yet/);
  });

  it('offers choices that always include the current value', () => {
    expect(wallClock('19:30')).toBe('7:30 PM');
    expect(wallClock('00:05')).toBe('12:05 AM');
    expect(startTimeChoices('19:30')).toContain('19:30');
    expect(startTimeChoices('05:15')[0]).toBe('05:15');
    expect(durationChoices(90)).toContain(90);
    expect(durationChoices(95)).toContain(95);
    expect(durationLabel(90)).toBe('90 min');
    expect(opensLabel(5)).toBe('5 days before');
    expect(opensLabel(1)).toBe('1 day before');
    expect(opensLabel(0)).toBe('The day of');
    expect(opensChoices(4)).toEqual([1, 2, 3, 4, 5, 7, 14]);
    expect(opensChoices(5)).toEqual([1, 2, 3, 5, 7, 14]);
    const until = untilChoices('2027-03-30', '2026-11-03');
    expect(until[0]).toBeNull();
    expect(until).toContain('2026-12-31');
    expect(until).toContain('2027-03-30');
    expect(untilChoices(null, '2026-11-03')).toHaveLength(7);
    expect(untilLabel(null)).toBe('No end date');
    expect(untilLabel('2027-03-30')).toBe('March 30, 2027');
  });

  const s = (over: Partial<SeriesSession>): SeriesSession =>
    ({
      session_id: 'x',
      activity_id: 'a',
      occurs_on: '2026-11-10',
      starts_at: '2026-11-11T00:30:00Z',
      status: 'scheduled',
      skip_reason: null,
      capacity: 14,
      in_count: 9,
      open_count: 5,
      waitlist_count: 0,
      asking_count: 0,
      opens_at: '2026-11-05T00:30:00Z',
      members_open_at: '2026-11-03T00:30:00Z',
      members_first: true,
      ...over,
    }) as SeriesSession;

  it('describes the next sessions', () => {
    expect(sessionRow(s({}), TZ, NOW)).toMatchObject({
      day: 'TUE',
      date: 'NOV 10',
      title: '9 in · 5 open',
      meta: 'Members are already in',
      action: 'SKIP',
      actionLabel: 'Skip Nov 10',
    });
    expect(sessionRow(s({ members_first: false }), TZ, NOW).meta).toBe('Opens to everyone Nov 4');
    expect(sessionRow(s({ opens_at: '2026-11-01T00:00:00Z', waitlist_count: 2 }), TZ, NOW).meta).toBe('2 waiting');
    expect(sessionRow(s({ opens_at: '2026-11-01T00:00:00Z', asking_count: 1 }), TZ, NOW).meta).toBe('1 asking');
    expect(sessionRow(s({ opens_at: '2026-11-01T00:00:00Z' }), TZ, NOW).meta).toBe('Open to everyone');
    expect(sessionRow(s({ status: 'skipped', skip_reason: 'Field booked for a tournament' }), TZ, NOW)).toMatchObject({
      title: 'Skipped',
      meta: 'Field booked for a tournament',
      action: 'RESTORE',
    });
    expect(sessionRow(s({ status: 'skipped', in_count: 0 }), TZ, NOW).meta).toBe('Nobody was in yet');
    expect(sessionRow(s({ status: 'skipped', in_count: 3 }), TZ, NOW).meta).toBe('3 people kept their place');
  });
});

const view = {
  session_id: 'S',
  activity_id: 'A',
  name: 'Tuesday 7-a-side',
  place_name: 'Jeanne-Mance Park · turf 2',
  place_area: 'Plateau',
  time_zone: TZ,
  starts_at: START,
  ends_at: END,
  check_in_opens_at: '2026-11-04T00:00:00Z',
  status: 'scheduled',
  effective_status: 'confirmed',
  capacity: 14,
  in_count: 14,
  checked_in_count: 0,
  waitlist_count: 3,
  waitlist_auto_fill: true,
  auto_fill_active: false,
  auto_fill_cutoff_at: '2026-11-03T22:30:00Z',
  price_cents: 800,
  settled: 13,
  settle_total: 14,
  settle_note: 'Tomás is new and pays $8 at the field.',
} as unknown as SessionView;

describe('HostRoster', () => {
  it('heads the session', () => {
    expect(sessionOverline(START, TZ, NOW)).toBe('TONIGHT · 7:30');
    expect(sessionOverline('2026-11-03T15:00:00Z', TZ, NOW)).toBe('TODAY · 10:00');
    expect(sessionOverline('2026-11-05T00:30:00Z', TZ, NOW)).toBe('TOMORROW · 7:30');
    expect(sessionOverline('2026-11-09T00:30:00Z', TZ, NOW)).toBe('SUN NOV 8 · 7:30');
    expect(sessionHeadline('Tuesday 7-a-side')).toBe('TUESDAY 7⁠-⁠A⁠-⁠SIDE.');
    expect(sessionHeadline('Done.')).toBe('DONE.');
    expect(sessionLine(view, NOW)).toBe('Jeanne-Mance Park · turf 2 · 7:30 to 9:00. Starts in 50 minutes.');
    expect(rosterCountLabel(view)).toBe('14 / 14 IN · 3 WAITING');
    expect(rosterCountLabel({ ...view, waitlist_count: 0, checked_in_count: 5 })).toBe('14 / 14 IN · 5 CHECKED IN');
  });

  it('says when it starts', () => {
    expect(startsIn(view, new Date('2026-11-03T20:00:00Z'))).toBe('Starts in 5 hours.');
    expect(startsIn(view, new Date('2026-11-01T20:00:00Z'))).toBe('Starts in 2 days.');
    expect(startsIn(view, new Date('2026-11-04T01:00:00Z'))).toBe('On now.');
    expect(startsIn(view, new Date('2026-11-04T03:00:00Z'))).toBe('Ended at 9:00.');
    expect(startsIn({ ...view, status: 'skipped' }, NOW)).toMatch(/^Skipped/);
    expect(startsIn({ ...view, effective_status: 'cancelled' }, NOW)).toBe('Called off.');
  });

  it('knows when check-in is open', () => {
    expect(checkInNote(view, NOW)).toBe('Check-in opens at 7:00. Players tap in at the pitch, or you mark them in.');
    expect(canCheckIn(view, NOW)).toBe(false);
    const at = new Date('2026-11-04T00:10:00Z');
    expect(canCheckIn(view, at)).toBe(true);
    expect(checkInNote(view, at)).toMatch(/^Check-in is open/);
    expect(checkInNote(view, new Date('2026-11-04T03:00:00Z'))).toMatch(/closed/);
    expect(canCheckIn({ ...view, status: 'skipped' }, at)).toBe(false);
  });

  it('states the waitlist rule', () => {
    expect(waitlistNote(view)).toBe(
      "The waitlist stopped filling itself at 5:30. If someone drops now, you choose who's in and they hear straight away.",
    );
    expect(waitlistNote({ ...view, auto_fill_active: true })).toMatch(/fills itself until 5:30/);
    expect(waitlistNote({ ...view, waitlist_auto_fill: false })).toMatch(/doesn't fill itself/);
    expect(addSpotLabel(14)).toBe('ADD A 15TH SPOT');
    expect(addSpotLabel(21)).toBe('ADD A 22ND SPOT');
    expect(positionWord(1)).toBe('First');
    expect(positionWord(12)).toBe('12th');
  });

  it('settles in words, and says when payments are not connected', () => {
    expect(settlement(view)).toEqual({ kind: 'open', title: '13 of 14 settled', note: 'Tomás is new and pays $8 at the field.' });
    expect(settlement({ ...view, settled: 14 })?.kind).toBe('settled');
    expect(settlement({ ...view, settled: null, settle_total: null })).toEqual({ kind: 'not-connected' });
    expect(settlement({ ...view, settled: null, settle_total: null, price_cents: 0 })).toBeNull();
  });

  const row = (over: Partial<RosterRow>): RosterRow =>
    ({
      section: 'in',
      user_id: 'u',
      display_name: 'Chimdi O',
      is_host: false,
      is_member: false,
      first_time: false,
      last12_count: 11,
      last12_total: 12,
      plays_most_dow: null,
      waitlisted_at: null,
      promoted_at: null,
      checked_in_at: null,
      approved_at: null,
      approved_via: null,
      dropped_at: null,
      replaced_by_name: null,
      replaced_at: null,
      payment_status: null,
      payment_label: null,
      payment_detail: null,
      ...over,
    }) as RosterRow;

  it('describes who is in', () => {
    expect(rosterMeta(row({}), TZ, NOW)).toBe('11 of the last 12');
    expect(rosterMeta(row({ is_host: true }), TZ, NOW)).toBe('Hosting');
    expect(rosterMeta(row({ promoted_at: '2026-11-03T19:31:00Z' }), TZ, NOW)).toBe('In from the waitlist at 2:31');
    expect(
      rosterMeta(row({ first_time: true, approved_via: 'host', approved_at: '2026-10-31T15:00:00Z' }), TZ, NOW),
    ).toBe('First time · you approved them Saturday');
    expect(rosterMeta(row({ first_time: true }), TZ, NOW)).toBe('First time');
    expect(rosterMeta(row({ last12_total: 0, payment_detail: '4 sessions left' }), TZ, NOW)).toBe('4 sessions left');
    expect(rosterMeta(row({ checked_in_at: '2026-11-04T00:02:00Z' }), TZ, NOW)).toBe('Checked in at 7:02 · 11 of the last 12');
  });

  it('describes the waitlist and who dropped', () => {
    expect(rosterMeta(row({ section: 'waitlist', waitlisted_at: '2026-10-31T15:00:00Z', plays_most_dow: 4 }), TZ, NOW)).toBe(
      'Waiting since Saturday · plays most Thursdays',
    );
    expect(rosterMeta(row({ section: 'waitlist', waitlisted_at: '2026-11-03T13:00:00Z', first_time: true, approved_via: 'host' }), TZ, NOW)).toBe(
      'Waiting since this morning · first time, approved',
    );
    expect(rosterMeta(row({ section: 'waitlist', first_time: true }), TZ, NOW)).toBe('Waiting · first time');
    expect(rosterMeta(row({ section: 'waitlist', waitlisted_at: '2026-11-02T22:00:00Z' }), TZ, NOW)).toBe('Waiting since yesterday');
    expect(rosterMeta(row({ section: 'waitlist', waitlisted_at: '2026-10-20T15:00:00Z' }), TZ, NOW)).toBe('Waiting since Oct 20');
    expect(
      rosterMeta(
        row({
          section: 'dropped',
          display_name: 'Dayo F',
          dropped_at: '2026-11-03T19:30:00Z',
          replaced_by_name: 'Rina K',
          replaced_at: '2026-11-03T19:31:00Z',
          payment_detail: "Dayo's $8 went back automatically.",
        }),
        TZ,
        NOW,
      ),
    ).toBe("Dropped at 2:30. Rina took the spot a minute later. Dayo's $8 went back automatically.");
    expect(rosterMeta(row({ section: 'dropped' }), TZ, NOW)).toBe('Dropped. The spot is open.');
  });

  it('badges in words', () => {
    expect(rosterBadge(row({ is_host: true }))).toEqual({ label: 'HOST', signal: true });
    expect(rosterBadge(row({ payment_label: '$8 at field', payment_status: 'due_at_field' }))).toEqual({ label: '$8 AT FIELD', signal: true });
    expect(rosterBadge(row({ payment_label: 'Paid $8', payment_status: 'paid' }))).toEqual({ label: 'PAID $8', signal: false });
    expect(rosterBadge(row({ is_member: true }))).toEqual({ label: 'MEMBER', signal: false });
    expect(rosterBadge(row({}))).toBeNull();
    expect(paymentDue('due')).toBe(true);
    expect(paymentDue(null)).toBe(false);
  });

  it('moves waitlist people', () => {
    expect(moveUp(['a', 'b', 'c'], 2)).toEqual(['a', 'c', 'b']);
    expect(moveUp(['a', 'b'], 0)).toEqual(['a', 'b']);
    expect(moveDown(['a', 'b', 'c'], 0)).toEqual(['b', 'a', 'c']);
  });
});

describe('HostRequests', () => {
  it('heads with counts', () => {
    expect(requestsHeadline(2, 0)).toBe('2 WANT IN.');
    expect(requestsHeadline(1, 1)).toBe('1 MORE WANTS IN.');
    expect(requestsHeadline(1, 0)).toBe('1 WANTS IN.');
    expect(requestsHeadline(0, 2)).toBe('ALL ANSWERED.');
    expect(requestsHeadline(0, 0)).toBe('NOBODY’S ASKING.');
    expect(requestsCountLabel(9, 12, 2)).toBe('9 / 12 IN · 3 OPEN · 2 ASKING');
    expect(requestsCountLabel(13, 12, 0)).toBe('13 / 12 IN · 0 OPEN');
    expect(approvalIntro(true)).toMatch(/never an address/);
    expect(approvalIntro(false)).toMatch(/off/);
  });

  const req = (over: Partial<JoinRequestRow>): JoinRequestRow =>
    ({
      request_id: 'r',
      user_id: 'u',
      display_name: 'Grace N',
      area: 'Verdun',
      distance_km: 3,
      id_verified: false,
      new_to_ojoro: false,
      ojoro_games: 14,
      showed_up: 14,
      show_up_of: 14,
      note: null,
      shared_names: ['Chimdi O'],
      shared_count: 1,
      status: 'pending',
      approved_via: null,
      ...over,
    }) as JoinRequestRow;

  it('shows area, facts and who you both know', () => {
    expect(requestArea(req({}))).toBe('Verdun · about 3 km away');
    expect(requestArea(req({ distance_km: null }))).toBe('Verdun');
    expect(requestArea(req({ area: null, distance_km: null }))).toBeNull();
    expect(requestFacts(req({}))).toEqual(['14 OJORO GAMES', 'SHOWED UP 14 OF 14']);
    expect(requestFacts(req({ id_verified: true, new_to_ojoro: true, ojoro_games: 1, show_up_of: 0 }))).toEqual([
      'ID VERIFIED',
      'NEW TO OJORO',
      '1 OJORO GAME',
    ]);
    expect(requestContext(req({}))).toBe('You both play with Chimdi O.');
    expect(requestContext(req({ shared_names: ['A', 'B'], shared_count: 4 }))).toBe('You both play with A, B and 2 others.');
    expect(requestContext(req({ shared_names: [], shared_count: 0, new_to_ojoro: true, ojoro_games: 0 }))).toBe(
      'New to Ojoro, so there is no history yet. Nobody you know.',
    );
  });

  it('words the answer', () => {
    expect(decidedText(req({ status: 'approved', approved_via: 'host' }))).toBe('Grace is in and has been told.');
    expect(decidedText(req({ status: 'declined' }))).toBe('Declined quietly.');
    expect(decidedText(req({ status: 'withdrawn' }))).toBe('Grace took the request back.');
    expect(decidedText(req({ status: 'approved', approved_via: 'crews' }))).toBe('Grace got in straight away: they share a crew with you.');
    expect(crewsRuleBody(['Plateau Pickup', 'Thursday FC'])).toBe('Members of Plateau Pickup and Thursday FC.');
    expect(crewsRuleBody([])).toMatch(/crew/);
  });
});
