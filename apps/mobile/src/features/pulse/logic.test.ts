import type { PulseMarker } from '@ojoro/contracts';
import { describe, expect, it } from 'vitest';

import {
  areaLabels,
  defaultSelection,
  emptyCopy,
  headerCaption,
  keepSelection,
  liveWord,
  mapTitle,
  markerPoints,
  periodWords,
  placeIdOf,
  PULSE_WHEN_CHIPS,
  pulseCity,
  shortArea,
} from './logic';

const base = {
  place_id: null,
  place_name: null,
  distance_km: null,
  activity_count: null,
  live_count: null,
  forming_count: null,
  forming_plan_id: null,
  forming_sport_name: null,
  forming_member_count: null,
  forming_capacity: null,
  forming_starts_at: null,
  live_activity_id: null,
  live_title: null,
  sport_id: null,
  sport_name: null,
  people_count: null,
  city: 'Montréal',
  lat: 45.5,
  lng: -73.6,
} as const;

const place = (over: Partial<PulseMarker> = {}): PulseMarker =>
  ({
    ...base,
    kind: 'place',
    marker_id: 'place:p1',
    place_id: 'p1',
    place_name: 'Jeanne-Mance Park',
    area: 'Plateau, Montréal',
    label: 'Plateau, Montréal',
    activity_count: 12,
    live_count: 0,
    forming_count: 1,
    forming_plan_id: 'plan1',
    forming_sport_name: 'Football',
    forming_member_count: 6,
    forming_capacity: 8,
    summary: 'Jeanne-Mance Park: 12 activities tonight, football forming at 6 of 8.',
    ...over,
  }) as PulseMarker;

const area = (over: Partial<PulseMarker> = {}): PulseMarker =>
  ({
    ...base,
    kind: 'area',
    marker_id: 'area:Montréal:Plateau, Montréal',
    area: 'Plateau, Montréal',
    label: 'Plateau, Montréal',
    activity_count: 14,
    summary: 'Plateau: 14 activities tonight.',
    ...over,
  }) as PulseMarker;

const demand = (over: Partial<PulseMarker> = {}): PulseMarker =>
  ({
    ...base,
    kind: 'demand',
    marker_id: 'demand:Montréal:Mile End, Montréal:volleyball',
    area: 'Mile End, Montréal',
    label: 'Mile End, Montréal',
    sport_id: 'volleyball',
    sport_name: 'Volleyball',
    people_count: 5,
    summary: '5 people want volleyball near Mile End tonight.',
    ...over,
  }) as PulseMarker;

describe('markers as map points', () => {
  it('turns a place into counts, a forming pill and its spoken summary', () => {
    const [p] = markerPoints([place()]);
    expect(p).toMatchObject({
      id: 'place:p1',
      name: 'Jeanne-Mance Park',
      area: 'Plateau',
      activeCount: 12,
      forming: { count: 6, capacity: 8, sport: 'Football' },
      live: null,
      accessibilityLabel: 'Jeanne-Mance Park: 12 activities tonight, football forming at 6 of 8.',
    });
  });

  it('puts the live pill on a place with something live', () => {
    const [p] = markerPoints([place({ activity_count: 1, live_count: 1, live_title: 'Sparring rounds', forming_plan_id: null })]);
    expect(p!.live).toEqual({ word: 'SPARRING' });
    expect(p!.forming).toBeNull();
    // A busy place keeps its count disc; the summary says what's live.
    expect(markerPoints([place({ live_count: 1, live_title: 'Pickup football' })])[0]!.live).toBeNull();
  });

  it('turns demand into a count with its sport, never names', () => {
    const [d] = markerPoints([demand()]);
    expect(d).toMatchObject({ name: 'Mile End', wanting: { count: 5, sport: 'Volleyball' } });
    expect(Object.keys(d!)).not.toContain('people');
    expect(markerPoints([demand({ people_count: null })])).toEqual([]);
  });

  it('skips an area whose places are on the map, keeps others', () => {
    const pts = markerPoints([place(), area(), area({ marker_id: 'area:Montréal:Downtown', area: 'Downtown, Montréal', label: 'Downtown, Montréal', activity_count: 3 })]);
    expect(pts.map((p) => p.id)).toEqual(['place:p1', 'area:Montréal:Downtown']);
    expect(pts[1]).toMatchObject({ name: 'Downtown', activeCount: 3 });
    expect(markerPoints([area({ activity_count: null })])[0]!.activeCount).toBe(0);
  });

  it('falls back when a place has no name or counts', () => {
    const [p] = markerPoints([place({ place_name: null, activity_count: null, forming_member_count: null })]);
    expect(p!.name).toBe('Plateau, Montréal');
    expect(p!.activeCount).toBe(0);
    expect(p!.forming).toEqual({ count: 0, capacity: 8, sport: 'Football' });
    expect(markerPoints([place({ forming_sport_name: null })])[0]!.forming!.sport).toBeUndefined();
  });
});

describe('words', () => {
  it('writes the header caption', () => {
    expect(headerCaption('tonight', 3, true)).toBe('Tonight · 3 km');
    expect(headerCaption('week', 3, false)).toBe('This week');
    expect(headerCaption('now', null, true)).toBe('Next hour');
  });

  it('has the window words and chips', () => {
    expect(periodWords('weekend')).toBe('this weekend');
    expect(PULSE_WHEN_CHIPS.map((c) => c.id)).toContain('tonight');
  });

  it('shortens areas and live titles', () => {
    expect(shortArea('Plateau, Montréal')).toBe('Plateau');
    expect(shortArea('')).toBeUndefined();
    expect(shortArea(null)).toBeUndefined();
    expect(liveWord('Sparring rounds')).toBe('SPARRING');
    expect(liveWord('  ')).toBe('LIVE');
    expect(liveWord('Evening 5K')).toBe('EVENING 5K');
  });

  it('names the map and its city', () => {
    expect(mapTitle([place()], null)).toBe('Map of Montréal');
    expect(mapTitle([], 'Toronto')).toBe('Map of Toronto');
    expect(mapTitle([], null)).toBe('Map of what is on near you');
    expect(pulseCity([place()], null)).toBe('Montréal');
    expect(pulseCity([place()], 'Toronto')).toBe('Toronto');
    expect(pulseCity([], null)).toBeNull();
  });

  it('says what is empty and whether to widen', () => {
    expect(emptyCopy('tonight', null)).toEqual({ line: 'Nothing on near you tonight.', widen: true });
    expect(emptyCopy('week', 'Boxing')).toEqual({ line: 'No boxing near you this week.', widen: false });
  });
});

describe('selection', () => {
  it('opens on the busiest place and keeps a selection only while it is drawn', () => {
    expect(defaultSelection([demand(), place()])).toBe('place:p1');
    expect(defaultSelection([demand()])).toBeNull();
    expect(keepSelection('place:p1', [{ id: 'place:p1' }])).toBe('place:p1');
    expect(keepSelection('place:p2', [{ id: 'place:p1' }])).toBeNull();
    expect(keepSelection(null, [{ id: 'place:p1' }])).toBeNull();
  });

  it('reads the place id from a marker id', () => {
    expect(placeIdOf('place:abc')).toBe('abc');
    expect(placeIdOf('area:x')).toBeNull();
    expect(placeIdOf('place:')).toBeNull();
    expect(placeIdOf(null)).toBeNull();
  });

  it('labels each area once', () => {
    const a = { area: 'Plateau, Montréal', city: 'Montréal', lat: 45.52, lng: -73.58 };
    expect(areaLabels([a, a])).toEqual([{ id: 'Montréal:Plateau, Montréal', name: 'Plateau', lat: 45.52, lng: -73.58 }]);
  });
});
