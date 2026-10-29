import { describe, expect, it } from 'vitest';

import {
  afterWhen,
  demandCopy,
  groupedCount,
  groupResults,
  itemTitle,
  MAX_QUERY,
  needsArea,
  NO_FILTERS,
  nowStrip,
  nowSummary,
  offlineResultsLine,
  personCard,
  personResultLine,
  pickDemand,
  placeCard,
  placeResultCard,
  resultsSummary,
  resultStrip,
  searchState,
  shortArea,
  stripStatus,
  suggestionCopy,
  type DemandBucket,
  type NowItem,
  type SearchRow,
  type SuggestionRow,
} from './logic';

const TZ = 'America/Toronto';
// Thu 29 Oct 2026, 9:00 AM in Montréal (EDT, UTC−4).
const NOW = new Date('2026-10-29T13:00:00Z');

const item = (over: Partial<NowItem> = {}): NowItem => ({
  kind: 'plan',
  plan_id: 'p1',
  activity_id: null,
  sport_id: 'tennis',
  sport_name: 'Tennis',
  title: 'Tennis doubles',
  starts_at: '2026-10-29T13:50:00Z',
  status: 'forming',
  member_count: 2,
  capacity: 4,
  spots_left: 2,
  place_name: 'Jeanne-Mance Park',
  place_time_zone: TZ,
  distance_km: 0.6,
  minutes_to_start: 50,
  played_with_count: 2,
  action: 'join',
  reasons: ['starts in 50 min', '0.6 km', "2 people you've played with"],
  reason: "starts in 50 min · 0.6 km · 2 people you've played with",
  ...over,
});

const row = (over: Partial<SearchRow> = {}): SearchRow => ({
  kind: 'plan',
  id: 'x',
  title: null,
  sport_id: null,
  sport_name: null,
  starts_at: null,
  effective_status: null,
  member_count: null,
  capacity: null,
  place_name: null,
  place_area: null,
  distance_km: null,
  plans_tonight: null,
  handle: null,
  games_with_me: null,
  ...over,
});

const bucket = (over: Partial<DemandBucket> = {}): DemandBucket => ({
  sport_id: 'volleyball',
  sport_name: 'Volleyball',
  window_start: '2026-10-29T21:00:00Z',
  window_end: '2026-10-30T04:00:00Z',
  suggested_start: '2026-10-29T23:00:00Z',
  people_count: 5,
  ...over,
});

describe('searchState', () => {
  it('browses with nothing typed or picked', () => {
    expect(searchState(NO_FILTERS)).toEqual({ mode: 'browse' });
    expect(searchState({ ...NO_FILTERS, query: '   ', when: 'any' })).toEqual({ mode: 'browse' });
  });

  it('builds the arguments from the query and chips, trimmed and collapsed', () => {
    expect(searchState({ query: '  jeanne   mance ', sportId: 'tennis', when: 'tonight', kind: 'everything' })).toEqual({
      mode: 'results',
      args: { p_query: 'jeanne mance', p_sport_id: 'tennis', p_when: 'tonight' },
      hint: null,
    });
    expect(searchState({ ...NO_FILTERS, kind: 'places' })).toEqual({ mode: 'results', args: {}, hint: null });
  });

  it('refuses a query over the limit, in words with the count', () => {
    const s = searchState({ ...NO_FILTERS, query: 'a'.repeat(MAX_QUERY + 1) });
    expect(s).toEqual({ mode: 'invalid', error: 'Keep it to 80 characters. You have 81.' });
  });

  it('says how people search works', () => {
    expect(searchState({ ...NO_FILTERS, kind: 'people' })).toMatchObject({
      hint: "Type a name. Search finds people you've played with.",
    });
    expect(searchState({ ...NO_FILTERS, query: 'a' })).toMatchObject({ hint: 'People show from 2 letters.' });
    expect(searchState({ ...NO_FILTERS, query: 'ad', kind: 'people' })).toMatchObject({ hint: null });
    expect(searchState({ ...NO_FILTERS, query: 'a', kind: 'places' })).toMatchObject({ hint: null });
  });
});

describe('groupResults', () => {
  const rows = [row({ kind: 'plan', id: '1' }), row({ kind: 'place', id: '2' }), row({ kind: 'person', id: '3' })];
  it('groups by kind and filters by the chip', () => {
    const all = groupResults(rows, 'everything');
    expect(all.plans.map((r) => r.id)).toEqual(['1']);
    expect(all.places.map((r) => r.id)).toEqual(['2']);
    expect(all.people.map((r) => r.id)).toEqual(['3']);
    expect(groupedCount(all)).toBe(3);
    expect(groupedCount(groupResults(rows, 'plans'))).toBe(1);
    expect(groupResults(rows, 'people').people).toHaveLength(1);
    expect(groupResults(rows, 'places').plans).toHaveLength(0);
  });
});

describe('resultsSummary', () => {
  it('counts and names the filters', () => {
    expect(resultsSummary(3, { p_query: 'jeanne' }, {})).toBe('3 results for “jeanne”.');
    expect(resultsSummary(1, {}, { sport: 'Tennis', when: 'Tonight' })).toBe('1 result in tennis tonight.');
    expect(resultsSummary(0, { p_query: 'xyz' }, {})).toBe('Nothing for “xyz”.');
    expect(resultsSummary(0, {}, {})).toBe('Nothing.');
  });
});

describe('stripStatus and itemTitle', () => {
  it('maps plan status to the strip tag', () => {
    expect(stripStatus('live', 2, 2)).toBe('live');
    expect(stripStatus('game_on', 4, 4)).toBe('confirmed');
    expect(stripStatus('forming', 4, 4)).toBe('full');
    expect(stripStatus('forming', 2, 4)).toBe('forming');
    expect(stripStatus(null, null, null)).toBe('forming');
  });
  it('falls back to the sport', () => {
    expect(itemTitle('  ', 'Football')).toBe('Football');
    expect(itemTitle(null, null)).toBe('A game');
    expect(itemTitle('Evening 5K', 'Running')).toBe('Evening 5K');
  });
});

describe('nowStrip', () => {
  it('shows the start time, the place and the reasons without the time reason', () => {
    expect(nowStrip(item())).toEqual({
      key: 'plan-p1',
      activity: 'Tennis doubles',
      time: '9:50',
      place: "Jeanne-Mance Park · 0.6 km · 2 you've played with",
      status: 'forming',
      count: 2,
      capacity: 4,
      route: { to: 'plan', id: 'p1' },
      action: 'join',
    });
  });

  it('live games read NOW and open the activity to watch', () => {
    const s = nowStrip(
      item({ kind: 'activity', activity_id: 'a1', status: 'live', action: 'watch', reasons: ['on now', '1.5 km'] }),
    );
    expect(s).toMatchObject({ time: 'NOW', status: 'live', route: { to: 'activity', id: 'a1' }, action: 'watch' });
    expect(s.place).toBe('Jeanne-Mance Park · 1.5 km');
  });

  it('copes with no place, no reasons and an unknown action', () => {
    const s = nowStrip(
      item({ place_name: null, reasons: null, place_time_zone: null, action: 'other', status: 'game_on', kind: 'activity' }),
    );
    expect(s.place).toBe('Place to be agreed · 0.6 km');
    expect(s.action).toBe('join');
    expect(s.status).toBe('confirmed');
    // An activity row without its id opens the plan.
    expect(s.route).toEqual({ to: 'plan', id: 'p1' });
    expect(nowStrip(item({ reasons: [], distance_km: null, action: 'waitlist' }))).toMatchObject({
      place: 'Jeanne-Mance Park',
      action: 'waitlist',
    });
  });
});

describe('resultStrip', () => {
  it('puts the day, place and distance under the time', () => {
    const s = resultStrip(
      row({
        id: 'p2',
        title: 'Football tonight',
        sport_name: 'Football',
        starts_at: '2026-10-29T23:30:00Z',
        effective_status: 'forming',
        member_count: 6,
        capacity: 8,
        place_name: 'Jeanne-Mance Park',
        distance_km: 0.6,
      }),
      NOW,
      TZ,
    );
    expect(s).toMatchObject({ time: '7:30', place: 'Tonight · Jeanne-Mance Park · 0.6 km', count: 6, capacity: 8 });
  });
  it('live results say so', () => {
    const s = resultStrip(row({ effective_status: 'live', sport_name: 'Boxing' }), NOW, TZ);
    expect(s).toMatchObject({ time: 'NOW', place: 'On now · Place to be agreed', action: 'watch', count: 0 });
  });
});

describe('nowSummary', () => {
  it('counts things and people free, never adjectives', () => {
    expect(nowSummary(3, 0)).toBe('3 things start soon.');
    expect(nowSummary(1, null)).toBe('1 thing starts soon.');
    expect(nowSummary(0, 1)).toBe(
      "Nothing starts within the hour near you. 1 person you've played with is usually free about now.",
    );
    expect(nowSummary(3, 4)).toBe("3 things start soon. 4 people you've played with are usually free about now.");
  });
});

describe('latent demand', () => {
  it('prefers a sport with nothing on, then the soonest', () => {
    const later = bucket({ sport_id: 'tennis', sport_name: 'Tennis', suggested_start: '2026-10-30T23:00:00Z' });
    expect(pickDemand([later, bucket()], [{ sport_id: 'tennis' }])).toEqual({ bucket: bucket(), nothingOn: true });
    expect(pickDemand([bucket()], [{ sport_id: 'volleyball' }])).toEqual({ bucket: bucket(), nothingOn: false });
    expect(pickDemand([], [])).toBeNull();
    expect(pickDemand([bucket({ people_count: 0 })], [])).toBeNull();
  });

  it('says when, in the local zone', () => {
    expect(afterWhen('2026-10-29T23:00:00Z', NOW, TZ)).toBe('after 7');
    expect(afterWhen('2026-10-29T23:30:00Z', NOW, TZ)).toBe('after 7:30');
    expect(afterWhen('2026-10-30T23:00:00Z', NOW, TZ)).toBe('tomorrow after 7');
    expect(afterWhen('2026-10-31T16:00:00Z', NOW, TZ)).toBe('Sat after 12');
  });

  it('is a count only: no names, no places', () => {
    const copy = demandCopy({ bucket: bucket(), nothingOn: true }, 3, NOW, TZ);
    expect(copy).toEqual({
      overline: 'NOTHING ON FOR VOLLEYBALL',
      headline: "5 people within 3 km want to play volleyball after 7. That's a game.",
    });
    expect(demandCopy({ bucket: bucket({ people_count: 1 }), nothingOn: false }, null, NOW, TZ)).toEqual({
      overline: 'MORE VOLLEYBALL WANTED',
      headline: "1 person near you wants to play volleyball after 7. That's a game.",
    });
  });
});

describe('suggestionCopy', () => {
  const plan: SuggestionRow = {
    kind: 'plan',
    plan_id: 'p1',
    sport_id: 'tennis',
    sport_name: 'Tennis',
    title: 'Tennis doubles',
    starts_at: '2026-10-29T13:50:00Z',
    place_name: 'Jeanne-Mance Park',
    distance_km: 0.6,
    member_count: 2,
    capacity: 4,
    demand_count: null,
    window_start: null,
    window_end: null,
    reason: "it's 0.6 km away and 2 people you've played with are in",
  };
  it('a plan: facts and the reason as Why', () => {
    expect(suggestionCopy(plan, NOW, TZ)).toEqual({
      title: 'Tennis doubles',
      body: 'Today 9:50 AM · Jeanne-Mance Park · 0.6 km · 2 of 4 in',
      why: "Why: It's 0.6 km away and 2 people you've played with are in.",
      action: 'open',
    });
  });
  it('demand: a count, MAKE IT HAPPEN', () => {
    const s = suggestionCopy(
      { ...plan, kind: 'demand', plan_id: null, title: null, starts_at: '2026-10-29T23:00:00Z', demand_count: 5, reason: null },
      NOW,
      TZ,
    );
    expect(s).toEqual({ title: 'Tennis', body: 'Tonight 7 PM · 5 people want to play', why: null, action: 'demand' });
    expect(
      suggestionCopy({ ...plan, place_name: null, distance_km: null, member_count: null }, NOW, TZ).body,
    ).toBe('Today 9:50 AM');
    expect(suggestionCopy({ ...plan, kind: 'demand', demand_count: null }, NOW, TZ).body).toBe('Today 9:50 AM');
  });
});

describe('people and places', () => {
  it('shortArea keeps the neighbourhood', () => {
    expect(shortArea('Plateau, Montréal')).toBe('Plateau');
    expect(shortArea(null)).toBeUndefined();
    expect(shortArea(' ')).toBeUndefined();
  });

  it('person cards follow their settings and show counts only', () => {
    expect(
      personCard({
        user_id: 'u',
        display_name: 'Ade B',
        handle: 'ade',
        area: 'Plateau, Montréal',
        sports: ['Football', 'Running'],
        sessions: 12,
        games_with_me: 12,
        reason: ' You played. ',
      }),
    ).toEqual({
      key: 'u',
      name: 'Ade B',
      handle: 'ade',
      area: 'Plateau',
      sports: ['Football', 'Running'],
      stats: [
        { value: '12', label: 'Sessions' },
        { value: '12', label: 'Games with you' },
      ],
      reason: 'You played.',
    });
    const hidden = personCard({
      user_id: 'v',
      display_name: 'Joel',
      handle: 'joel',
      area: null,
      sports: null,
      sessions: null,
      games_with_me: 0,
      reason: null,
    });
    expect(hidden).toMatchObject({ sports: [], stats: [], reason: null, area: undefined });
    expect(personCard({ ...hidden, sessions: 1 } as never).stats).toEqual([{ value: '1', label: 'Session' }]);
  });

  it('place cards: first sport, surface, distance, lights, tonight', () => {
    const name = (id: string) => (id === 'football' ? 'Football' : id);
    expect(
      placeCard(
        {
          place_id: 'b1',
          name: 'Jeanne-Mance Park',
          area: 'Plateau',
          sport_ids: ['football', 'running'],
          surface: 'Turf',
          floodlit_until: '23:00:00',
          distance_km: 0.6,
          plans_tonight: 2,
        },
        name,
      ),
    ).toEqual({
      key: 'b1',
      name: 'Jeanne-Mance Park',
      kind: 'Football',
      surface: 'Turf',
      distance: '0.6 km',
      lights: '11 PM',
      plansTonight: 2,
    });
    expect(
      placeCard(
        { place_id: 'b2', name: 'X', area: null, sport_ids: null, surface: null, floodlit_until: null, distance_km: null, plans_tonight: null },
        name,
      ),
    ).toMatchObject({ kind: 'Place', surface: undefined, distance: undefined, lights: undefined, plansTonight: 0 });
  });

  it('search rows for places and people', () => {
    expect(placeResultCard(row({ id: 'b1', title: 'Parc Jarry', place_area: 'Villeray', distance_km: 4, plans_tonight: 1 }))).toEqual({
      key: 'b1',
      name: 'Parc Jarry',
      kind: 'Villeray',
      surface: undefined,
      distance: '4 km',
      lights: undefined,
      plansTonight: 1,
    });
    expect(placeResultCard(row({ id: 'b2' }))).toMatchObject({ name: 'Place', kind: 'Place', plansTonight: 0 });
    expect(personResultLine(row({ handle: 'ade', games_with_me: 12 }))).toBe('@ade · 12 games with you');
    expect(personResultLine(row({ games_with_me: 1 }))).toBe('1 game with you');
    expect(personResultLine(row())).toBe('');
  });
});

describe('area and offline', () => {
  it('needs an area when there is none or the server says so', () => {
    expect(needsArea(false)).toBe(true);
    expect(needsArea(true, 'area_required')).toBe(true);
    expect(needsArea(true)).toBe(false);
    expect(needsArea(undefined)).toBe(false);
  });
  it('dates the last results', () => {
    expect(offlineResultsLine(new Date(2026, 9, 29, 19, 2), true)).toBe("You're offline. These results are from 7:02 PM.");
    expect(offlineResultsLine(new Date(2026, 9, 29, 0, 5), true)).toBe("You're offline. These results are from 12:05 AM.");
    expect(offlineResultsLine(null, true)).toMatch(/Search needs a connection/);
    expect(offlineResultsLine(new Date(), false)).toMatch(/Search needs a connection/);
  });
});
