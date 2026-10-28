import { describe, expect, it } from 'vitest';

import {
  availabilitySummary,
  dayShort,
  normalizeSlots,
  partHeading,
  slotKey,
  slotLabel,
  toggleSlot,
} from './AvailabilityGrid.logic';

describe('AvailabilityGrid logic', () => {
  it('names cells like the prototype', () => {
    expect(slotLabel('tue', 'evening', true)).toBe('Tuesday evening, free');
    expect(slotLabel('mon', 'morning', false)).toBe('Monday morning, not set');
    expect(dayShort('sat')).toBe('SAT');
    expect(partHeading('midday')).toBe('MIDDAY');
    expect(slotKey('sun', 'morning')).toBe('sun-morning');
  });

  it('toggles on and off, keeping week order', () => {
    const on = toggleSlot(['sat-morning'], 'tue-evening');
    expect(on).toEqual(['tue-evening', 'sat-morning']);
    expect(toggleSlot(on, 'sat-morning')).toEqual(['tue-evening']);
  });

  it('drops duplicates and unknown keys', () => {
    expect(normalizeSlots(['sun-morning', 'mon-midday', 'sun-morning', 'xyz'])).toEqual([
      'mon-midday',
      'sun-morning',
    ]);
  });

  it('summarises the count', () => {
    expect(availabilitySummary([])).toBe('No free times set');
    expect(availabilitySummary(['tue-evening'])).toBe('1 time free');
    expect(availabilitySummary(['tue-evening', 'wed-evening'])).toBe('2 times free');
  });
});
