/**
 * The area picker's pure rules (undesigned screen; docs/LIQUIDITY_CONTRACT.md, Areas). An area is a
 * neighbourhood from `areas_list()`, never an address, and the device's location is never asked for.
 */

export type AreaRow = {
  area: string;
  city: string;
  label: string;
  place_count: number;
};

/** Lowercase, accents off, spaces squeezed: "Montréal" and "montreal" match. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Areas whose neighbourhood or city contains the query (every word of it), in list order. */
export function filterAreas<T extends AreaRow>(areas: readonly T[], query: string): T[] {
  const words = fold(query).split(' ').filter(Boolean);
  if (words.length === 0) return [...areas];
  return areas.filter((a) => {
    const hay = fold(`${a.area} ${a.city}`);
    return words.every((w) => hay.includes(w));
  });
}

/** "Saint-Henri, Montréal" → "Saint-Henri" (the neighbourhood part of a profile's area label). */
export function areaName(label: string | null | undefined): string | null {
  const trimmed = label?.trim();
  if (!trimmed) return null;
  return trimmed.split(',')[0]?.trim() || trimmed;
}

/** "Montréal · 2 places" under each row: what's behind the area, never where anyone is. */
export function areaMeta(row: Pick<AreaRow, 'city' | 'place_count'>): string {
  const n = row.place_count;
  return `${row.city} · ${n} ${n === 1 ? 'place' : 'places'} to play`;
}

/** The empty search state, in words, with the next step. */
export function noMatchLine(query: string): string {
  return `No area matches "${query.trim()}". Ojoro lists the neighbourhoods it has places in; pick the closest one.`;
}

/** The privacy promise on both the onboarding step and settings. */
export const AREA_PRIVACY_LINE =
  "An area, never an address. Ojoro keeps the neighbourhood, not where you are, and never asks for your location.";

/** The key for "not now" on Home's area prompt: asked once per person on this device. */
export function areaPromptKey(userId: string): string {
  return `ojoro.area-prompt.dismissed.${userId}`;
}
