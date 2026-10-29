import { describe, expect, it } from 'vitest';

import { areaMeta, areaName, areaPromptKey, filterAreas, fold, noMatchLine } from './logic';

const AREAS = [
  { area: 'Mile End', city: 'Montréal', label: 'Mile End, Montréal', place_count: 1 },
  { area: 'Plateau', city: 'Montréal', label: 'Plateau, Montréal', place_count: 2 },
  { area: 'Saint-Henri', city: 'Montréal', label: 'Saint-Henri, Montréal', place_count: 1 },
];

describe('area picker', () => {
  it('folds accents, case and spaces', () => {
    expect(fold('  Montréal   EST ')).toBe('montreal est');
  });

  it('filters on neighbourhood and city, every word', () => {
    expect(filterAreas(AREAS, '')).toHaveLength(3);
    expect(filterAreas(AREAS, 'plat').map((a) => a.area)).toEqual(['Plateau']);
    expect(filterAreas(AREAS, 'montreal')).toHaveLength(3);
    expect(filterAreas(AREAS, 'saint montreal').map((a) => a.area)).toEqual(['Saint-Henri']);
    expect(filterAreas(AREAS, 'verdun')).toEqual([]);
  });

  it('takes the neighbourhood from a label', () => {
    expect(areaName('Saint-Henri, Montréal')).toBe('Saint-Henri');
    expect(areaName('Verdun')).toBe('Verdun');
    expect(areaName('  ')).toBeNull();
    expect(areaName(null)).toBeNull();
  });

  it('says what is behind an area, in the singular at one', () => {
    expect(areaMeta({ city: 'Montréal', place_count: 1 })).toBe('Montréal · 1 place to play');
    expect(areaMeta({ city: 'Montréal', place_count: 2 })).toBe('Montréal · 2 places to play');
  });

  it('words the empty search and keys the prompt per person', () => {
    expect(noMatchLine(' verdun ')).toContain('"verdun"');
    expect(areaPromptKey('u1')).toBe('ojoro.area-prompt.dismissed.u1');
  });
});
