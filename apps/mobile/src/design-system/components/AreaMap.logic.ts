/**
 * Pure logic for AreaMap: the provider-agnostic shape of a Pulse map point,
 * what each marker says, the spoken text alternative, and the schematic
 * renderer's projection. No React here, so it is unit-tested.
 *
 * Privacy (PRD §9.16, §11.2): a point is a public place or area centroid with
 * aggregate counts. There is no field for a person, and nothing here places
 * anyone individually.
 */

/** A place or area on the map: its public centroid and its aggregates. */
export type AreaMapPoint = {
  id: string;
  /** "Jeanne-Mance Park". */
  name: string;
  /** Neighbourhood, for the list ("Plateau"). */
  area?: string | undefined;
  /** Public centroid (places.lat / places.lng). Never a person's location. */
  lat: number;
  lng: number;
  /** Activities in the window ("12 active"). */
  activeCount?: number | undefined;
  /** A plan forming here ("forming 6 / 8"). */
  forming?: { count: number; capacity: number; sport?: string | undefined } | null | undefined;
  /** Aggregate demand ("5 want volleyball"). Counts only, no names. */
  wanting?: { count: number; sport: string } | null | undefined;
  /** Something live here; `word` is the pill's word ("SPARRING"). */
  live?: { word: string } | null | undefined;
  /** Overrides the spoken line for this point. */
  accessibilityLabel?: string | undefined;
};

/** A neighbourhood name set on the ground ("PLATEAU"). Decorative; the list names areas per point. */
export type AreaMapArea = { id: string; name: string; lat: number; lng: number };

export type AreaMapView = 'map' | 'list';

export type AreaMapInset = {
  top?: number | undefined;
  right?: number | undefined;
  bottom?: number | undefined;
  left?: number | undefined;
};

/** An inset with every edge set. */
export type AreaMapEdges = { top: number; right: number; bottom: number; left: number };

export type MarkerKind = 'live' | 'active' | 'forming' | 'wanting';

export type MarkerModel = {
  kind: MarkerKind;
  /** Disc diameter (active, wanting); pill height for forming and live. */
  size: number;
  /** The figure on the marker ("12"), empty for live. */
  figure: string;
  /** The word on the marker (ACTIVE, WANT\nVOLLEYBALL, SPARRING, FORMING), or null when the disc is too small. */
  word: string | null;
  /** A forming pill under the primary marker ("6 / 8"), or null. */
  forming: string | null;
};

export const DISC_MIN = 36;
export const DISC_MAX = 104;
/** Discs this big carry their word (ACTIVE) under the figure. */
export const DISC_WORD_MIN = 64;
export const WANT_MIN = 104;
export const WANT_MAX = 120;
export const PILL_HEIGHT = 32;
/** Every marker's touch area is at least this big. */
export const HIT_MIN = 44;
/** Default space kept between a marker's centre and the map's edge. */
export const EDGE_PAD = 56;
export const DEFAULT_PERIOD = 'tonight';

const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LNG = 111.32;

function count(n: number | undefined | null): number {
  return Number.isFinite(n) && (n as number) > 0 ? Math.floor(n as number) : 0;
}

/** Disc diameter by count: area grows with the count, 36pt to 104pt. */
export function discSize(n: number): number {
  return Math.max(DISC_MIN, Math.min(DISC_MAX, Math.round(22 * Math.sqrt(count(n)))));
}

/** The dashed demand disc needs room for its two words. */
export function wantSize(n: number): number {
  return Math.max(WANT_MIN, Math.min(WANT_MAX, Math.round(22 * Math.sqrt(count(n)))));
}

/** "6 / 8": tabular, spaced like the design. */
export function fraction(a: number, b: number): string {
  return `${count(a)} / ${count(b)}`;
}

/** Does the point have anything to put on the map? */
export function hasActivity(p: AreaMapPoint): boolean {
  return (
    count(p.activeCount) > 0 ||
    count(p.forming?.count) > 0 ||
    count(p.wanting?.count) > 0 ||
    Boolean(p.live?.word)
  );
}

/**
 * One primary marker per point, by what matters most right now: live, then
 * active, then forming, then demand. A forming plan rides under a live or
 * active marker as a pill. Null when there is nothing to draw.
 */
export function markerModel(p: AreaMapPoint): MarkerModel | null {
  const active = count(p.activeCount);
  const formingPill =
    p.forming && count(p.forming.capacity) > 0
      ? fraction(p.forming.count, p.forming.capacity)
      : null;
  if (p.live?.word) {
    return {
      kind: 'live',
      size: PILL_HEIGHT,
      figure: '',
      word: p.live.word.toUpperCase(),
      forming: formingPill,
    };
  }
  if (active > 0) {
    const size = discSize(active);
    return {
      kind: 'active',
      size,
      figure: String(active),
      word: size >= DISC_WORD_MIN ? 'ACTIVE' : null,
      forming: formingPill,
    };
  }
  if (formingPill) {
    return {
      kind: 'forming',
      size: PILL_HEIGHT,
      figure: formingPill,
      word: 'FORMING',
      forming: null,
    };
  }
  const want = count(p.wanting?.count);
  if (want > 0 && p.wanting) {
    return {
      kind: 'wanting',
      size: wantSize(want),
      figure: String(want),
      word: `WANT\n${p.wanting.sport.toUpperCase()}`,
      forming: null,
    };
  }
  return null;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * What a point has, as short parts. `spoken` reads fractions as "6 of 8".
 * ["12 activities tonight", "football forming 6 / 8", "5 want volleyball", "sparring live"]
 */
export function pointParts(
  p: AreaMapPoint,
  { spoken = false, period = DEFAULT_PERIOD }: { spoken?: boolean; period?: string } = {},
): string[] {
  const parts: string[] = [];
  if (p.live?.word) parts.push(`${p.live.word.toLowerCase()} live`);
  const active = count(p.activeCount);
  if (active > 0) parts.push(`${plural(active, 'activity', 'activities')} ${period}`.trim());
  if (p.forming && count(p.forming.capacity) > 0) {
    const what = p.forming.sport ? `${p.forming.sport.toLowerCase()} forming` : 'plan forming';
    const n = count(p.forming.count);
    const cap = count(p.forming.capacity);
    parts.push(spoken ? `${what} at ${n} of ${cap}` : `${what} ${fraction(n, cap)}`);
  }
  const want = count(p.wanting?.count);
  if (want > 0 && p.wanting) {
    parts.push(`${want} ${want === 1 ? 'wants' : 'want'} ${p.wanting.sport.toLowerCase()}`);
  }
  if (parts.length === 0) parts.push(`nothing on ${period}`.trim());
  return parts;
}

/** The list line: "12 activities tonight · football forming 6 / 8". Starts with a capital. */
export function pointLine(p: AreaMapPoint, period: string = DEFAULT_PERIOD): string {
  return capitalise(pointParts(p, { period }).join(' · '));
}

/** A marker's or list row's spoken name: "Jeanne-Mance Park, Plateau: 12 activities tonight, football forming at 6 of 8." */
export function pointLabel(
  p: AreaMapPoint,
  { selected = false, period = DEFAULT_PERIOD }: { selected?: boolean; period?: string } = {},
): string {
  const base =
    p.accessibilityLabel ??
    `${p.name}${p.area ? `, ${p.area}` : ''}: ${pointParts(p, { spoken: true, period }).join(', ')}.`;
  return selected ? `${base} Selected.` : base;
}

/** Busiest first: activities, then forming, then demand, then name. Stable for the list and the summary. */
export function sortByBusiest(points: readonly AreaMapPoint[]): AreaMapPoint[] {
  const score = (p: AreaMapPoint) => [
    count(p.activeCount),
    count(p.forming?.count),
    count(p.wanting?.count),
    p.live?.word ? 1 : 0,
  ];
  return [...points].sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    const i = sa.findIndex((v, k) => v !== sb[k]);
    return i >= 0 ? sb[i]! - sa[i]! : a.name.localeCompare(b.name);
  });
}

export const SUMMARY_MAX = 5;

/**
 * The map's full text alternative, like Pulse's artboard aria-label:
 * "Map of central Montréal. Busiest: Jeanne-Mance Park, 12 activities tonight,
 * football forming at 6 of 8. Parc La Fontaine: 5 want volleyball. …"
 */
export function mapSummary(
  title: string,
  points: readonly AreaMapPoint[],
  period: string = DEFAULT_PERIOD,
): string {
  const head = title.trim().replace(/\.$/, '');
  const on = sortByBusiest(points.filter(hasActivity));
  if (on.length === 0) return `${head}. Nothing on ${period} in this area.`;
  const lines = on.slice(0, SUMMARY_MAX).map((p, i) => {
    const what = pointParts(p, { spoken: true, period }).join(', ');
    return i === 0 && on.length > 1 ? `Busiest: ${p.name}, ${what}.` : `${p.name}: ${what}.`;
  });
  const more = on.length - SUMMARY_MAX;
  if (more > 0) lines.push(`${plural(more, 'more place', 'more places')} in the list.`);
  return `${head}. ${lines.join(' ')}`;
}

export function toggleLabel(view: AreaMapView): string {
  return view === 'map' ? 'SHOW AS LIST' : 'SHOW AS MAP';
}

export function emptyLine(period: string = DEFAULT_PERIOD): string {
  return `Nothing on ${period} in this area.`;
}

function capitalise(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

export type Box = { width: number; height: number };
export type Projection = {
  project: (lat: number, lng: number) => { x: number; y: number };
  /** Points per km on screen (for a scale note). */
  pxPerKm: number;
};

/**
 * Fits the points' centroids into the box less `inset` (local equirectangular
 * in km, north up, one scale on both axes, centred). A single point, or points
 * closer than `minSpanKm`, are not blown up: the box spans at least that.
 */
export function fitProjection(
  coords: readonly { lat: number; lng: number }[],
  box: Box,
  inset: AreaMapEdges,
  { minSpanKm = 1 }: { minSpanKm?: number } = {},
): Projection {
  const w = Math.max(1, box.width - inset.left - inset.right);
  const h = Math.max(1, box.height - inset.top - inset.bottom);
  const valid = coords.filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng));
  if (valid.length === 0) {
    return { project: () => ({ x: inset.left + w / 2, y: inset.top + h / 2 }), pxPerKm: 0 };
  }
  const lats = valid.map((c) => c.lat);
  const lngs = valid.map((c) => c.lng);
  const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
  const lng0 = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const kx = KM_PER_DEG_LNG * Math.cos((lat0 * Math.PI) / 180);
  const spanX = Math.max((Math.max(...lngs) - Math.min(...lngs)) * kx, minSpanKm);
  const spanY = Math.max((Math.max(...lats) - Math.min(...lats)) * KM_PER_DEG_LAT, minSpanKm);
  const pxPerKm = Math.min(w / spanX, h / spanY);
  const cx = inset.left + w / 2;
  const cy = inset.top + h / 2;
  return {
    pxPerKm,
    project: (lat, lng) => ({
      x: cx + (lng - lng0) * kx * pxPerKm,
      y: cy - (lat - lat0) * KM_PER_DEG_LAT * pxPerKm,
    }),
  };
}

export type Placed = { id: string; x: number; y: number; r: number };

/**
 * Pushes overlapping markers apart (a few relaxation passes) so every marker
 * stays readable and keeps its own 44pt target, then keeps them in `bounds`.
 * Positions are approximate on purpose: areas, not addresses.
 */
export function separate(
  items: readonly Placed[],
  bounds: { left: number; top: number; right: number; bottom: number },
  { gap = 4, passes = 24 }: { gap?: number; passes?: number } = {},
): Placed[] {
  const out = items.map((p) => ({ ...p }));
  const clamp = (p: Placed) => {
    p.x = Math.min(
      Math.max(p.x, bounds.left + p.r),
      Math.max(bounds.left + p.r, bounds.right - p.r),
    );
    p.y = Math.min(
      Math.max(p.y, bounds.top + p.r),
      Math.max(bounds.top + p.r, bounds.bottom - p.r),
    );
  };
  out.forEach(clamp);
  for (let pass = 0; pass < passes; pass += 1) {
    let moved = false;
    for (let i = 0; i < out.length; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) {
        const a = out[i]!;
        const b = out[j]!;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        const need = a.r + b.r + gap;
        if (d >= need) continue;
        if (d === 0) {
          // Same centroid: split along a fixed diagonal so the result is stable.
          dx = 1;
          dy = 1;
          d = Math.SQRT2;
        }
        const push = (need - d) / 2;
        const ux = dx / d;
        const uy = dy / d;
        a.x -= ux * push;
        a.y -= uy * push;
        b.x += ux * push;
        b.y += uy * push;
        clamp(a);
        clamp(b);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}

/** The collision radius a marker needs: half its widest side, never under half the hit area. */
export function markerRadius(m: MarkerModel): number {
  const pillWidth = (text: string) => 24 + text.length * 8;
  let w = m.size;
  let h = m.size;
  if (m.kind === 'live') w = 40 + (m.word?.length ?? 0) * 10;
  if (m.kind === 'forming') w = pillWidth(`FORMING ${m.figure}`);
  if (m.forming) {
    w = Math.max(w, pillWidth(`FORMING ${m.forming}`));
    h += PILL_HEIGHT + 4;
  }
  return Math.max(HIT_MIN / 2, Math.max(w, h) / 2);
}

export type LabelBox = { id: string; x: number; y: number; width: number; height: number };

/** Rough width of a label-sm caps word, for collision only. */
export function labelWidth(name: string): number {
  return name.length * 10 + 8;
}

function boxHitsCircle(b: LabelBox, c: Placed): boolean {
  const nx = Math.max(b.x - b.width / 2, Math.min(c.x, b.x + b.width / 2));
  const ny = Math.max(b.y - b.height / 2, Math.min(c.y, b.y + b.height / 2));
  return Math.hypot(nx - c.x, ny - c.y) < c.r;
}

function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return (
    Math.abs(a.x - b.x) * 2 < a.width + b.width && Math.abs(a.y - b.y) * 2 < a.height + b.height
  );
}

/** Space between a moved name and the marker it steps aside from. */
export const LABEL_GAP = 6;

/**
 * Where a name can go when its centroid is under a marker: just above it,
 * just below it, then to its right and left. Areas and places share
 * centroids, so the name steps aside instead of being dropped.
 */
export function labelCandidates(l: LabelBox, m: Placed): LabelBox[] {
  const dy = m.r + l.height / 2 + LABEL_GAP;
  const dx = m.r + l.width / 2 + LABEL_GAP;
  return [
    { ...l, x: m.x, y: m.y - dy },
    { ...l, x: m.x, y: m.y + dy },
    { ...l, x: m.x + dx, y: m.y },
    { ...l, x: m.x - dx, y: m.y },
  ];
}

/**
 * Neighbourhood names that fit: inside `bounds`, clear of every marker and of
 * each other (first come, first kept). A name whose centroid sits under a
 * marker moves beside that marker (`labelCandidates`); it is dropped only
 * when no spot is clear. Never drawn over a marker. Boxes are centred on x, y.
 */
export function fitLabels(
  labels: readonly LabelBox[],
  markers: readonly Placed[],
  bounds: { left: number; top: number; right: number; bottom: number },
): LabelBox[] {
  const kept: LabelBox[] = [];
  const fits = (l: LabelBox) =>
    l.x - l.width / 2 >= bounds.left &&
    l.x + l.width / 2 <= bounds.right &&
    l.y - l.height / 2 >= bounds.top &&
    l.y + l.height / 2 <= bounds.bottom &&
    !markers.some((m) => boxHitsCircle(l, m)) &&
    !kept.some((k) => boxesOverlap(k, l));
  for (const l of labels) {
    const covering = markers
      .filter((m) => boxHitsCircle(l, m))
      .sort((a, b) => Math.hypot(a.x - l.x, a.y - l.y) - Math.hypot(b.x - l.x, b.y - l.y));
    const tries = [l, ...covering.flatMap((m) => labelCandidates(l, m))];
    const spot = tries.find(fits);
    if (spot) kept.push(spot);
  }
  return kept;
}

/** Edge padding for the fit: EDGE_PAD, less when the room left is small. */
export function edgePad(width: number, height: number): number {
  return Math.max(HIT_MIN / 2, Math.min(EDGE_PAD, Math.min(width, height) / 4));
}
