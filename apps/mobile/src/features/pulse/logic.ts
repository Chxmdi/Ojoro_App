/**
 * Pure logic for Pulse (`/pulse`, Pulse.png; docs/PLACES_CONTRACT.md, Pulse): server markers as
 * AreaMap points, the area names on the ground, the header caption, the when chips, and what the
 * selected-marker sheet says. Aggregates only: nothing here can place a person.
 */
import { PULSE_WHEN_LABEL, PULSE_WHEN_WORDS, type PulseMarker, type PulseWhen } from '@ojoro/contracts';

import type { AreaMapArea, AreaMapPoint } from '@/design-system/components/AreaMap.logic';

/** The time chips after the sport chips (Discover's order). Tonight is the default. */
export const PULSE_WHEN_CHIPS: readonly { id: PulseWhen; label: string }[] = [
  { id: 'now', label: 'Next hour' },
  { id: 'tonight', label: 'Tonight' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'weekend', label: 'This weekend' },
  { id: 'week', label: 'This week' },
];

export const DEFAULT_WHEN: PulseWhen = 'tonight';

/** "Tonight · 3 km" (the radius only when you have an area). */
export function headerCaption(when: PulseWhen, radiusKm: number | null | undefined, hasArea: boolean): string {
  const parts = [PULSE_WHEN_LABEL[when]];
  if (hasArea && radiusKm != null) parts.push(`${radiusKm} km`);
  return parts.join(' · ');
}

/** The words the map uses for its window in spoken labels ("tonight", "this week"). */
export function periodWords(when: PulseWhen): string {
  return PULSE_WHEN_WORDS[when];
}

/** "Plateau, Montréal" → "Plateau". */
export function shortArea(area: string | null | undefined): string | undefined {
  const a = area?.split(',')[0]?.trim();
  return a || undefined;
}

/**
 * Server markers as AreaMap points. Places carry their counts, forming plan and live pill; demand its
 * count and sport; an area marker is drawn only when none of its places is on the map (the contract
 * lets a renderer skip those). Each point reads its server summary aloud.
 */
export function markerPoints(markers: readonly PulseMarker[]): AreaMapPoint[] {
  const placeAreas = new Set(markers.filter((m) => m.kind === 'place').map((m) => `${m.city}:${m.area}`));
  const out: AreaMapPoint[] = [];
  for (const m of markers) {
    if (m.kind === 'area' && placeAreas.has(`${m.city}:${m.area}`)) continue;
    if (m.kind === 'place') {
      out.push({
        id: m.marker_id,
        name: m.place_name ?? m.label,
        area: shortArea(m.area),
        lat: m.lat,
        lng: m.lng,
        activeCount: m.activity_count ?? 0,
        forming:
          m.forming_plan_id && m.forming_capacity
            ? {
                count: m.forming_member_count ?? 0,
                capacity: m.forming_capacity,
                sport: m.forming_sport_name ?? undefined,
              }
            : null,
        // The live pill leads only when everything here is live (Hoshino's SPARRING); a busy place keeps
        // its count disc (12 ACTIVE) and says what's live in its spoken summary.
        live:
          m.live_count && m.live_count > 0 && m.live_title && (m.activity_count ?? 0) <= m.live_count
            ? { word: liveWord(m.live_title) }
            : null,
        accessibilityLabel: m.summary,
      });
    } else if (m.kind === 'demand') {
      if (!m.people_count || !m.sport_name) continue;
      out.push({
        id: m.marker_id,
        // The name is the area already; no second area in the list row.
        name: shortArea(m.label) ?? m.area,
        area: undefined,
        lat: m.lat,
        lng: m.lng,
        wanting: { count: m.people_count, sport: m.sport_name },
        accessibilityLabel: m.summary,
      });
    } else {
      out.push({
        id: m.marker_id,
        name: shortArea(m.label) ?? m.area,
        area: undefined,
        lat: m.lat,
        lng: m.lng,
        activeCount: m.activity_count ?? 0,
        accessibilityLabel: m.summary,
      });
    }
  }
  return out;
}

/** The live pill's words: short titles whole ("EVENING 5K"), else the first word ("SPARRING"). */
export function liveWord(title: string): string {
  const t = title.trim().replace(/\s+/g, ' ');
  if (!t) return 'LIVE';
  return (t.length <= 10 ? t : (t.split(' ')[0] ?? t)).toUpperCase();
}

/** Neighbourhood names on the ground, one per area (deduplicated). */
export function areaLabels(areas: readonly { area: string; city: string; lat: number; lng: number }[]): AreaMapArea[] {
  const seen = new Set<string>();
  const out: AreaMapArea[] = [];
  for (const a of areas) {
    const id = `${a.city}:${a.area}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: shortArea(a.area) ?? a.area, lat: a.lat, lng: a.lng });
  }
  return out;
}

/** The map's title ("Map of central Montréal"): the city of the markers, or of your area. */
export function mapTitle(markers: readonly Pick<PulseMarker, 'city'>[], fallbackCity: string | null): string {
  const city = markers[0]?.city ?? fallbackCity;
  return city ? `Map of ${city}` : 'Map of what is on near you';
}

/** The city for the realtime channel: your area's, or the markers'. */
export function pulseCity(markers: readonly Pick<PulseMarker, 'city'>[], myCity: string | null): string | null {
  return myCity ?? markers[0]?.city ?? null;
}

/** The place id inside a place marker id (`place:{id}`), or null for areas and demand. */
export function placeIdOf(markerId: string | null | undefined): string | null {
  if (!markerId?.startsWith('place:')) return null;
  return markerId.slice('place:'.length) || null;
}

/** The busiest place marker (the server orders places busiest first): the sheet opens on it. */
export function defaultSelection(markers: readonly Pick<PulseMarker, 'kind' | 'marker_id'>[]): string | null {
  return markers.find((m) => m.kind === 'place')?.marker_id ?? null;
}

/** Keep a selection only while its marker is still on the map. */
export function keepSelection(selected: string | null, points: readonly Pick<AreaMapPoint, 'id'>[]): string | null {
  return selected && points.some((p) => p.id === selected) ? selected : null;
}

/** The empty map's line and what to offer. */
export function emptyCopy(when: PulseWhen, sportName: string | null): { line: string; widen: boolean } {
  const what = sportName ? `No ${sportName.toLowerCase()}` : 'Nothing on';
  return { line: `${what} near you ${PULSE_WHEN_WORDS[when]}.`, widen: when !== 'week' };
}
