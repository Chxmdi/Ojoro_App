import { describe, expect, it } from 'vitest';

import { placeLabel, placeLights, placeMeta, plansTonightCount } from './PlaceMiniCard.logic';

const park = {
  name: 'Jeanne-Mance Park',
  kind: 'Football',
  surface: 'Turf · north pitch',
  distance: '1.2 km',
  lights: '11 PM',
  plansTonight: 4,
};

describe('PlaceMiniCard logic', () => {
  it('joins kind, surface and distance', () => {
    expect(placeMeta(park)).toBe('Football · Turf · north pitch · 1.2 km');
    expect(placeMeta({ name: 'Hoshino', kind: 'Gym', distance: '2.8 km' })).toBe('Gym · 2.8 km');
  });

  it('writes the lights line', () => {
    expect(placeLights('11 PM')).toBe('Floodlit until 11 PM');
    expect(placeLights(undefined)).toBeNull();
  });

  it('shows a count only above zero', () => {
    expect(plansTonightCount(4)).toBe(4);
    expect(plansTonightCount(0)).toBeNull();
    expect(plansTonightCount(undefined)).toBeNull();
    expect(plansTonightCount(Number.NaN)).toBeNull();
  });

  it('reads as one link with the count', () => {
    expect(placeLabel(park)).toBe(
      'Jeanne-Mance Park, Football, Turf · north pitch, 1.2 km, floodlit until 11 PM, 4 plans tonight',
    );
    expect(placeLabel({ name: 'Hoshino Boxing', kind: 'Gym', plansTonight: 1 })).toBe(
      'Hoshino Boxing, Gym, 1 plan tonight',
    );
  });
});
