import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  busyBars,
  busyPartLabel,
  busyTimesData,
  groupCadence,
  groupTag,
  hostedHereWords,
  idempotentRpcs,
  liveWord,
  ojoroErrorCodes,
  placeCreatePrefill,
  placeSubscription,
  placesErrorCodes,
  placesLoggedReadRpcs,
  placesRpcs,
  pulseMapAreas,
  pulseMapPoints,
  pulseSubscription,
  pulseTextAlternative,
  tonightTag,
  PLACE_BUSY_MIN_GAMES,
  PLACE_HOST_MIN_GAMES,
  PULSE_WHEN,
  PULSE_WHEN_WORDS,
  type PulseMarker,
} from './index';

const migrationsDir = new URL('../../../supabase/migrations/', import.meta.url);
const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(new URL(f, migrationsDir), 'utf8'))
  .join('\n');

describe('places contract drift (CI-safe, no database needed)', () => {
  it('every Places RPC is defined in a migration and none is idempotent', () => {
    for (const name of placesRpcs) {
      expect(migrations, name).toMatch(new RegExp(`function public\\.${name}\\(`));
      expect(idempotentRpcs as readonly string[]).not.toContain(name);
    }
  });

  it('logged reads are volatile, the others are not', () => {
    for (const name of placesRpcs) {
      const start = migrations.lastIndexOf(`function public.${name}(`);
      const body = migrations.slice(start, migrations.indexOf('as $$', start));
      const logged = (placesLoggedReadRpcs as readonly string[]).includes(name);
      expect(body.includes('\nvolatile'), name).toBe(logged);
    }
  });

  it('error codes are existing, mapped codes', () => {
    for (const code of placesErrorCodes) {
      expect(ojoroErrorCodes as readonly string[]).toContain(code);
    }
  });

  it('thresholds match the server', () => {
    expect(migrations).toContain(
      `private.place_busy_min_games()\nreturns integer\nlanguage sql\nimmutable\nset search_path = ''\nas $$ select ${PLACE_BUSY_MIN_GAMES} $$`,
    );
    expect(migrations).toContain(
      `private.place_host_min_games()\nreturns integer\nlanguage sql\nimmutable\nset search_path = ''\nas $$ select ${PLACE_HOST_MIN_GAMES} $$`,
    );
  });

  it('every window is accepted by the server with the same words', () => {
    for (const when of PULSE_WHEN) {
      expect(migrations).toContain(`when '${when}' then`);
      expect(migrations).toContain(`'${PULSE_WHEN_WORDS[when]}'`);
    }
  });
});

const marker = (over: Partial<PulseMarker>): PulseMarker =>
  ({
    marker_id: 'place:1',
    kind: 'place',
    place_id: '1',
    place_name: 'Jeanne-Mance Park',
    area: 'Plateau',
    city: 'Montréal',
    label: 'Plateau, Montréal',
    lat: 45.5165,
    lng: -73.5862,
    distance_km: 1.2,
    activity_count: 12,
    live_count: 0,
    forming_count: 1,
    forming_plan_id: 'p',
    forming_sport_name: 'Football',
    forming_member_count: 6,
    forming_capacity: 8,
    forming_starts_at: '2026-10-30T23:30:00Z',
    live_activity_id: null,
    live_title: null,
    sport_id: null,
    sport_name: null,
    people_count: null,
    summary: 'Jeanne-Mance Park: 12 activities tonight, football forming at 6 of 8.',
    ...over,
  }) as PulseMarker;

describe('Pulse helpers', () => {
  const place = marker({});
  const live = marker({
    marker_id: 'place:5',
    place_name: 'Hoshino Boxing',
    area: 'Mile End',
    activity_count: 1,
    live_count: 1,
    live_title: 'Sparring rounds',
    forming_member_count: null,
    forming_capacity: null,
    summary: 'Hoshino Boxing: 1 activity tonight, Sparring rounds live now.',
  });
  const demand = marker({
    marker_id: 'demand:Montréal:Plateau:volleyball',
    kind: 'demand',
    place_id: null,
    place_name: null,
    activity_count: null,
    sport_name: 'Volleyball',
    people_count: 5,
    summary: '5 people want volleyball near Plateau tonight.',
  });
  const plateau = marker({
    marker_id: 'area:Montréal:Plateau',
    kind: 'area',
    summary: 'Plateau: 13.',
  });
  const downtown = marker({
    marker_id: 'area:Montréal:Downtown',
    kind: 'area',
    area: 'Downtown',
    summary: 'Downtown: 3 activities tonight.',
  });

  it('maps markers to map points and areas', () => {
    const points = pulseMapPoints([place, live, demand, plateau]);
    expect(points).toHaveLength(3);
    expect(points[0]).toMatchObject({
      activeCount: 12,
      forming: { count: 6, capacity: 8, sport: 'Football' },
      live: null,
    });
    expect(points[1]).toMatchObject({ live: { word: 'SPARRING' }, forming: null });
    expect(points[2]).toMatchObject({
      name: 'Near Plateau',
      wanting: { count: 5, sport: 'Volleyball' },
    });
    expect(pulseMapAreas([place, plateau])).toEqual([
      { id: 'area:Montréal:Plateau', name: 'PLATEAU', lat: 45.5165, lng: -73.5862 },
    ]);
  });

  it('builds the text alternative: places, unlisted areas, demand', () => {
    const text = pulseTextAlternative([plateau, downtown, demand, place], {
      label: 'central Montréal',
    });
    expect(text).toBe(
      'Map of central Montréal. Jeanne-Mance Park: 12 activities tonight, football forming at 6 of 8. ' +
        'Downtown: 3 activities tonight. 5 people want volleyball near Plateau tonight. Areas, not people.',
    );
    expect(pulseTextAlternative([])).toBe(
      'Map. Nothing on here for this filter. Areas, not people.',
    );
  });

  it('live word', () => {
    expect(liveWord(null)).toBe('LIVE');
    expect(liveWord('  ')).toBe('LIVE');
    expect(liveWord('Pickup football')).toBe('PICKUP');
  });

  it('realtime descriptors', () => {
    expect(pulseSubscription('Montréal')).toEqual({
      channel: 'pulse:Montréal',
      changes: [{ event: '*', schema: 'public', table: 'pulse_ticks', filter: 'city=eq.Montréal' }],
    });
    expect(placeSubscription('x').changes[0]?.filter).toBe('place_id=eq.x');
  });
});

describe('Place helpers', () => {
  const view = {
    place_id: 'pl',
    busy_levels: [29, 84, 71, 100, 48, 65, 44],
    today_day: 2,
    busiest_day: 4,
    prefill_sport_id: 'football',
    prefill_starts_at: '2026-10-30T23:00:00Z',
    prefill_capacity: 8,
    prefill_duration_minutes: 90,
  };

  it('busy bars and BusyTimes data', () => {
    const bars = busyBars(view);
    expect(bars.map((b) => b.label)).toEqual(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
    expect(bars[1]).toMatchObject({ isToday: true, isBusiest: false, level: 84 });
    expect(bars[3]?.isBusiest).toBe(true);
    expect(busyBars({ ...view, busy_levels: null })).toEqual([]);
    const data = busyTimesData(view);
    expect(data.currentIndex).toBe(1);
    expect(data.data[3]).toEqual({ key: '4', label: 'THU', name: 'Thursday', value: 100 });
    expect(busyTimesData({ busy_levels: null, today_day: 2 })).toEqual({
      data: [],
      currentIndex: null,
    });
    expect(busyTimesData({ ...view, today_day: 0 }).currentIndex).toBeNull();
    expect(busyPartLabel('evening')).toBe('EVENINGS');
    expect(busyPartLabel('morning')).toBe('MORNINGS');
    expect(busyPartLabel('midday')).toBe('AFTERNOONS');
    expect(busyPartLabel(null)).toBeNull();
  });

  it('row tags and words', () => {
    expect(tonightTag({ status: 'forming', member_count: 6, capacity: 8 })).toBe('6 / 8');
    expect(tonightTag({ status: 'game_on', member_count: 10, capacity: 10 })).toBe('GAME ON');
    expect(tonightTag({ status: 'live', member_count: 1, capacity: 2 })).toBe('LIVE');
    expect(groupTag({ kind: 'crew_ritual', access: 'crew' })).toBe('CREW');
    expect(groupTag({ kind: 'clan_ritual', access: 'open' })).toBe('OPEN');
    expect(groupTag({ kind: 'host_series', access: 'request' })).toBe('ASK TO JOIN');
    expect(groupTag({ kind: 'clan_ritual', access: 'invite' })).toBe('MEMBERS');
    expect(groupTag({ kind: 'clan_ritual', access: 'other' })).toBe('CREW');
    expect(
      groupCadence({ kind: 'crew_ritual', cadence: 'Every week, 7:30', weeks_running: 6 }),
    ).toBe('Every week, 7:30 · 6 weeks running');
    expect(groupCadence({ kind: 'host_series', cadence: 'Tue, 7:30', weeks_running: 34 })).toBe(
      'Tue, 7:30 · 34 sessions so far',
    );
    expect(
      groupCadence({ kind: 'clan_ritual', cadence: 'Every week, 7:00', weeks_running: 0 }),
    ).toBe('Every week, 7:00');
    expect(hostedHereWords(40)).toBe('40 games hosted here');
    expect(hostedHereWords(1)).toBe('1 game hosted here');
  });

  it('CREATE ACTIVITY HERE prefill', () => {
    expect(placeCreatePrefill(view)).toEqual({
      p_place_id: 'pl',
      p_sport_id: 'football',
      p_starts_at: '2026-10-30T23:00:00Z',
      p_capacity: 8,
      p_duration_minutes: 90,
    });
  });
});
