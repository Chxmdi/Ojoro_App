import { describe, expect, it } from 'vitest';

import { LATENT_DEMAND_NOTE, latentDemandModel } from './LatentDemand.logic';

describe('LatentDemand logic', () => {
  it('shows nothing without demand', () => {
    expect(latentDemandModel({ count: 0 })).toBeNull();
    expect(latentDemandModel({ count: -2 })).toBeNull();
    expect(latentDemandModel({ count: Number.NaN })).toBeNull();
  });

  it('keeps the count whole and writes the privacy note per variant', () => {
    expect(latentDemandModel({ count: 5.7 })).toEqual({
      count: 5,
      progress: null,
      note: LATENT_DEMAND_NOTE.panel,
    });
    expect(latentDemandModel({ variant: 'band', count: 3 })?.note).toBe(
      'Shown as a count. Names appear once the plan forms.',
    );
    expect(latentDemandModel({ count: 3, note: 'Custom.' })?.note).toBe('Custom.');
  });

  it('counts toward the threshold', () => {
    expect(latentDemandModel({ variant: 'band', count: 3, threshold: 4 })?.progress).toEqual({
      value: 3,
      max: 4,
      label: '3 of 4 needed',
    });
    expect(latentDemandModel({ count: 6, threshold: 4 })?.progress).toEqual({
      value: 4,
      max: 4,
      label: '4 of 4 needed',
    });
    expect(latentDemandModel({ count: 3, threshold: 0 })?.progress).toBeNull();
  });
});
