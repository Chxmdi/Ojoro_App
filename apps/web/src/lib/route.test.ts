import { describe, expect, it } from 'vitest';

import { DEFAULT_ROUTE, formatRoute, pageOf, parseRoute, withParams } from './route';

const ID = '0f2b7a4e-1c9d-4a51-9b7e-2a6d4c8e1f00';

describe('routes', () => {
  it('parses each screen', () => {
    expect(parseRoute('#/queue?severity=high&page=2')).toEqual({
      name: 'queue',
      params: { severity: 'high', page: '2' },
    });
    expect(parseRoute(`#/reports/${ID.toUpperCase()}`)).toEqual({ name: 'report', id: ID });
    expect(parseRoute('#/appeals')).toEqual({ name: 'appeals', params: {} });
    expect(parseRoute('#/audit?x=')).toEqual({ name: 'audit', params: {} });
    expect(parseRoute('#/places?q=parc')).toEqual({ name: 'places', params: { q: 'parc' } });
    expect(parseRoute('#/people?q=ade')).toEqual({ name: 'people', params: { q: 'ade' } });
    expect(parseRoute(`#/people/${ID}`)).toEqual({ name: 'person', id: ID });
    expect(parseRoute('#/people/nope')).toEqual(DEFAULT_ROUTE);
  });
  it('falls back to the queue', () => {
    expect(parseRoute('')).toEqual(DEFAULT_ROUTE);
    expect(parseRoute('#/reports/not-an-id')).toEqual(DEFAULT_ROUTE);
    expect(parseRoute('#/nope')).toEqual(DEFAULT_ROUTE);
  });
  it('formats round-trip with sorted params', () => {
    expect(formatRoute({ name: 'queue', params: { severity: 'high', kind: 'plan' } })).toBe(
      '#/queue?kind=plan&severity=high',
    );
    expect(formatRoute({ name: 'audit', params: {} })).toBe('#/audit');
    expect(formatRoute({ name: 'report', id: ID })).toBe(`#/reports/${ID}`);
    expect(formatRoute({ name: 'person', id: ID })).toBe(`#/people/${ID}`);
  });
  it('changes params and resets paging on a filter change', () => {
    const r = { name: 'queue' as const, params: { severity: 'high', page: '3' } };
    expect(withParams(r, { kind: 'plan' })).toEqual({
      name: 'queue',
      params: { severity: 'high', kind: 'plan' },
    });
    expect(withParams(r, { page: '4' })).toEqual({
      name: 'queue',
      params: { severity: 'high', page: '4' },
    });
    expect(withParams(r, { severity: '' })).toEqual({ name: 'queue', params: {} });
  });
  it('reads the page', () => {
    expect(pageOf({ page: '3' })).toBe(3);
    expect(pageOf({ page: '0' })).toBe(1);
    expect(pageOf({ page: 'x' })).toBe(1);
    expect(pageOf({})).toBe(1);
  });
});
