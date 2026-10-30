import { describe, expect, it } from 'vitest';

import {
  DISC_MAX,
  DISC_MIN,
  HIT_MIN,
  WANT_MAX,
  WANT_MIN,
  discSize,
  edgePad,
  fitLabels,
  labelCandidates,
  labelWidth,
  emptyLine,
  fitProjection,
  fraction,
  hasActivity,
  mapSummary,
  markerModel,
  markerRadius,
  pointLabel,
  pointLine,
  pointParts,
  separate,
  sortByBusiest,
  toggleLabel,
  wantSize,
  type AreaMapPoint,
} from './AreaMap.logic';

const park: AreaMapPoint = {
  id: 'jm',
  name: 'Jeanne-Mance Park',
  area: 'Plateau',
  lat: 45.5155,
  lng: -73.5857,
  activeCount: 12,
  forming: { count: 6, capacity: 8, sport: 'Football' },
};
const fontaine: AreaMapPoint = {
  id: 'lf',
  name: 'Parc La Fontaine',
  lat: 45.5275,
  lng: -73.5695,
  wanting: { count: 5, sport: 'volleyball' },
};
const boxing: AreaMapPoint = {
  id: 'hb',
  name: 'Hoshino Boxing',
  lat: 45.5,
  lng: -73.58,
  live: { word: 'Sparring' },
};
const quiet: AreaMapPoint = { id: 'q', name: 'Quiet court', lat: 45.51, lng: -73.6 };
const edges = { top: 0, right: 0, bottom: 0, left: 0 };

describe('sizes', () => {
  it('grows the disc with the count, between the bounds', () => {
    expect(discSize(1)).toBe(DISC_MIN);
    expect(discSize(12)).toBe(76);
    expect(discSize(1000)).toBe(DISC_MAX);
    expect(discSize(Number.NaN)).toBe(DISC_MIN);
    expect(discSize(-3)).toBe(DISC_MIN);
  });
  it('keeps the demand disc big enough for its words', () => {
    expect(wantSize(1)).toBe(WANT_MIN);
    expect(wantSize(1000)).toBe(WANT_MAX);
  });
  it('writes fractions spaced and whole', () => {
    expect(fraction(6, 8)).toBe('6 / 8');
    expect(fraction(6.7, -1)).toBe('6 / 0');
  });
});

describe('markerModel', () => {
  it('puts the active count first with a forming pill under it', () => {
    expect(markerModel(park)).toEqual({
      kind: 'active',
      size: 76,
      figure: '12',
      word: 'ACTIVE',
      forming: '6 / 8',
    });
  });
  it('drops the word on small discs', () => {
    expect(markerModel({ ...quiet, activeCount: 3 })).toMatchObject({ word: null, figure: '3' });
  });
  it('prefers live, keeping the forming pill', () => {
    expect(
      markerModel({ ...boxing, activeCount: 4, forming: { count: 2, capacity: 4 } }),
    ).toMatchObject({
      kind: 'live',
      word: 'SPARRING',
      forming: '2 / 4',
    });
  });
  it('shows a lone forming plan as the pill itself', () => {
    expect(markerModel({ ...quiet, forming: { count: 3, capacity: 10 } })).toMatchObject({
      kind: 'forming',
      figure: '3 / 10',
      word: 'FORMING',
      forming: null,
    });
  });
  it('shows demand as a dashed disc with words', () => {
    expect(markerModel(fontaine)).toMatchObject({
      kind: 'wanting',
      figure: '5',
      word: 'WANT\nVOLLEYBALL',
    });
  });
  it('draws nothing for a quiet place', () => {
    expect(markerModel(quiet)).toBeNull();
    expect(hasActivity(quiet)).toBe(false);
    expect(markerModel({ ...quiet, forming: { count: 1, capacity: 0 } })).toBeNull();
  });
});

describe('words', () => {
  it('lists what is on, visually and spoken', () => {
    expect(pointLine(park)).toBe('12 activities tonight · football forming 6 / 8');
    expect(pointParts(park, { spoken: true })).toEqual([
      '12 activities tonight',
      'football forming at 6 of 8',
    ]);
    expect(pointLine({ ...quiet, activeCount: 1 }, 'this week')).toBe('1 activity this week');
    expect(pointLine(fontaine)).toBe('5 want volleyball');
    expect(pointLine({ ...fontaine, wanting: { count: 1, sport: 'Tennis' } })).toBe(
      '1 wants tennis',
    );
    expect(pointLine(boxing)).toBe('Sparring live');
    expect(pointLine(quiet)).toBe('Nothing on tonight');
    expect(pointLine({ ...quiet, forming: { count: 2, capacity: 4 } })).toBe('Plan forming 2 / 4');
  });
  it('labels markers and rows, with selection in words', () => {
    expect(pointLabel(park)).toBe(
      'Jeanne-Mance Park, Plateau: 12 activities tonight, football forming at 6 of 8.',
    );
    expect(pointLabel(fontaine, { selected: true })).toBe(
      'Parc La Fontaine: 5 want volleyball. Selected.',
    );
    expect(pointLabel({ ...quiet, accessibilityLabel: 'Custom.' })).toBe('Custom.');
  });
  it('sorts busiest first, stable by name', () => {
    expect(sortByBusiest([quiet, fontaine, boxing, park]).map((p) => p.id)).toEqual([
      'jm',
      'lf',
      'hb',
      'q',
    ]);
    const a = { ...quiet, id: 'a', name: 'A' };
    const b = { ...quiet, id: 'b', name: 'B' };
    expect(sortByBusiest([b, a]).map((p) => p.id)).toEqual(['a', 'b']);
  });
  it('summarises the map like the artboard label', () => {
    expect(mapSummary('Map of central Montréal.', [boxing, fontaine, park, quiet])).toBe(
      'Map of central Montréal. Busiest: Jeanne-Mance Park, 12 activities tonight, football forming at 6 of 8. ' +
        'Parc La Fontaine: 5 want volleyball. Hoshino Boxing: sparring live.',
    );
    expect(mapSummary('Map', [park])).toBe(
      'Map. Jeanne-Mance Park: 12 activities tonight, football forming at 6 of 8.',
    );
    expect(mapSummary('Map', [quiet])).toBe('Map. Nothing on tonight in this area.');
  });
  it('caps the summary and points to the list', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({
      ...quiet,
      id: `p${i}`,
      name: `P${i}`,
      activeCount: 10 - i,
    }));
    const s = mapSummary('Map', many);
    expect(s).toContain('P4: 6 activities tonight.');
    expect(s).not.toContain('P5:');
    expect(s.endsWith('2 more places in the list.')).toBe(true);
    expect(mapSummary('Map', many.slice(0, 6)).endsWith('1 more place in the list.')).toBe(true);
  });
  it('names the toggle and the empty state', () => {
    expect(toggleLabel('map')).toBe('SHOW AS LIST');
    expect(toggleLabel('list')).toBe('SHOW AS MAP');
    expect(emptyLine()).toBe('Nothing on tonight in this area.');
  });
});

describe('fitProjection', () => {
  const box = { width: 400, height: 600 };
  it('fits the points inside the box, north up', () => {
    const { project } = fitProjection([park, fontaine, boxing], box, edges);
    const pts = [park, fontaine, boxing].map((p) => project(p.lat, p.lng));
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(-0.001);
      expect(p.x).toBeLessThanOrEqual(400.001);
      expect(p.y).toBeGreaterThanOrEqual(-0.001);
      expect(p.y).toBeLessThanOrEqual(600.001);
    }
    // Fontaine is north of the park: smaller y.
    expect(pts[1]!.y).toBeLessThan(pts[0]!.y);
    // and east: bigger x.
    expect(pts[1]!.x).toBeGreaterThan(pts[0]!.x);
    // One axis touches the edges (uniform scale).
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const spans = [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
    expect(spans.some((s) => Math.abs(s - 400) < 0.01 || Math.abs(s - 600) < 0.01)).toBe(true);
  });
  it('centres a single point inside the inset and does not blow it up', () => {
    const inset = { top: 100, right: 0, bottom: 200, left: 0 };
    const { project, pxPerKm } = fitProjection([park], box, inset);
    expect(project(park.lat, park.lng)).toEqual({ x: 200, y: 250 });
    expect(pxPerKm).toBe(300);
  });
  it('centres everything when there is nothing to fit', () => {
    const { project, pxPerKm } = fitProjection([{ lat: Number.NaN, lng: 0 }], box, edges);
    expect(project(1, 2)).toEqual({ x: 200, y: 300 });
    expect(pxPerKm).toBe(0);
  });
});

describe('separate', () => {
  const bounds = { left: 0, top: 0, right: 400, bottom: 600 };
  it('pushes overlapping markers apart', () => {
    const out = separate(
      [
        { id: 'a', x: 200, y: 300, r: 30 },
        { id: 'b', x: 210, y: 300, r: 30 },
      ],
      bounds,
    );
    expect(Math.hypot(out[1]!.x - out[0]!.x, out[1]!.y - out[0]!.y)).toBeGreaterThanOrEqual(63.9);
  });
  it('splits markers on the same centroid', () => {
    const out = separate(
      [
        { id: 'a', x: 200, y: 300, r: HIT_MIN / 2 },
        { id: 'b', x: 200, y: 300, r: HIT_MIN / 2 },
      ],
      bounds,
    );
    expect(Math.hypot(out[1]!.x - out[0]!.x, out[1]!.y - out[0]!.y)).toBeGreaterThanOrEqual(
      HIT_MIN,
    );
  });
  it('keeps markers inside the bounds and leaves the input alone', () => {
    const input = [{ id: 'a', x: -50, y: 900, r: 22 }];
    const out = separate(input, bounds);
    expect(out[0]).toEqual({ id: 'a', x: 22, y: 578, r: 22 });
    expect(input[0]!.x).toBe(-50);
  });
});

describe('markerRadius', () => {
  it('never goes under half the hit area and counts the pill', () => {
    expect(markerRadius(markerModel({ ...quiet, activeCount: 1 })!)).toBe(HIT_MIN / 2);
    expect(markerRadius(markerModel(park)!)).toBeGreaterThan(76 / 2);
    expect(markerRadius(markerModel(boxing)!)).toBeGreaterThan(HIT_MIN / 2);
    expect(
      markerRadius(markerModel({ ...quiet, forming: { count: 3, capacity: 10 } })!),
    ).toBeGreaterThan(HIT_MIN / 2);
  });
});

describe('labels', () => {
  const bounds = { left: 0, top: 0, right: 390, bottom: 400 };
  const box = (id: string, x: number, y: number, name = 'PLATEAU') => ({
    id,
    x,
    y,
    width: labelWidth(name),
    height: 16,
  });
  it('keeps names clear of markers, edges and each other', () => {
    const kept = fitLabels(
      [
        box('a', 100, 100),
        box('b', 110, 104),
        box('c', 300, 300),
        box('d', 5, 50),
        box('e', 200, 200),
      ],
      [{ id: 'm', x: 300, y: 300, r: 40 }],
      bounds,
    );
    expect(kept.map((l) => l.id)).toEqual(['a', 'c', 'e']);
    // c sat on the marker: it moved just above it, not dropped.
    const c = kept.find((l) => l.id === 'c')!;
    expect(c.x).toBe(300);
    expect(c.y).toBe(300 - (40 + 8 + 6));
  });
  it('steps a name aside from the marker on its centroid, in order', () => {
    const m = { id: 'm', x: 200, y: 200, r: 30 };
    const l = box('p', 200, 200);
    expect(labelCandidates(l, m).map(({ x, y }) => [x, y])).toEqual([
      [200, 156],
      [200, 244],
      [275, 200],
      [125, 200],
    ]);
    // Above is off the top: it goes below.
    const top = fitLabels([box('p', 200, 20)], [{ ...m, y: 20 }], bounds);
    expect(top[0]!.y).toBe(64);
  });
  it('drops a name only when every spot collides', () => {
    const m = { id: 'm', x: 195, y: 200, r: 30 };
    const ring = [
      { id: 'n', x: 195, y: 150, r: 20 },
      { id: 's', x: 195, y: 250, r: 20 },
      { id: 'e', x: 270, y: 200, r: 20 },
      { id: 'w', x: 120, y: 200, r: 20 },
    ];
    expect(fitLabels([box('p', 195, 200)], [m, ...ring], bounds)).toEqual([]);
  });
  it('sizes the label by its word', () => {
    expect(labelWidth('PLATEAU')).toBe(78);
  });
  it('pads less when the room is small', () => {
    expect(edgePad(390, 600)).toBe(56);
    expect(edgePad(390, 120)).toBe(30);
    expect(edgePad(390, 40)).toBe(HIT_MIN / 2);
  });
});
