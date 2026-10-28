import { describe, expect, it } from 'vitest';

import { clusterLabel, clusterModel, CLUSTER_DEFAULT_MAX, personKeys } from './AvatarCluster.logic';

const six = ['Ade B', 'Chimdi O', 'Marcus T', 'Lena R', 'Sam K', 'Yara M'].map((name) => ({ name }));

describe('clusterModel', () => {
  it('shows up to max people, then +N for the rest of total', () => {
    const m = clusterModel({ people: six, total: 9, max: 4 });
    expect(m.shown.map((p) => p.name)).toEqual(['Ade B', 'Chimdi O', 'Marcus T', 'Lena R']);
    expect(m.extra).toBe(5);
    expect(m.total).toBe(9);
  });

  it('defaults max to five like the web', () => {
    const m = clusterModel({ people: six });
    expect(m.shown).toHaveLength(CLUSTER_DEFAULT_MAX);
    expect(m.extra).toBe(1);
  });

  it('draws no +N when everyone fits', () => {
    const m = clusterModel({ people: six, total: 6, max: 6, open: 2 });
    expect(m.extra).toBe(0);
    expect(m.open).toBe(2);
    expect(m.label).toBe('6 people in, 2 open');
  });

  it('total defaults to the people given; bad numbers read as none', () => {
    const m = clusterModel({ people: six.slice(0, 3), open: -1, max: 0 });
    expect(m.total).toBe(3);
    expect(m.open).toBe(0);
    expect(m.label).toBe('3 people in');
  });

  it('handles no people', () => {
    const m = clusterModel({});
    expect(m.shown).toEqual([]);
    expect(m.extra).toBe(0);
    expect(m.label).toBe('0 people in');
  });

  it('counts a total larger than the people list as +N', () => {
    expect(clusterModel({ people: [], total: 11 }).extra).toBe(11);
  });
});

describe('clusterLabel', () => {
  it('reads one person in the singular', () => {
    expect(clusterLabel(1, 0)).toBe('1 person in');
    expect(clusterLabel(1, 3)).toBe('1 person in, 3 open');
  });
});

describe('personKeys', () => {
  it('keys by name and disambiguates repeats', () => {
    expect(personKeys([{ name: 'Sam' }, { name: 'Ade' }, { name: 'Sam' }])).toEqual(['Sam', 'Ade', 'Sam#1']);
  });
});
