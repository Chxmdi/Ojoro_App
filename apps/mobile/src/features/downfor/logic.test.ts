import { describe, expect, it } from 'vitest';

import {
  downForArgs,
  expiryOptions,
  hasErrors,
  signalLine,
  tonightArgs,
  validateDownFor,
  windowOptions,
  type DownForForm,
} from './logic';

const TZ = 'America/Toronto';
// Wed 28 Oct 2026, 4:02 PM in Montréal.
const NOW = new Date('2026-10-28T20:02:00Z');

describe('windows', () => {
  it('offers tonight from 6 PM, tomorrow and the weekend', () => {
    const w = windowOptions(NOW, TZ);
    expect(w.map((x) => x.id)).toEqual(['tonight', 'tomorrow-morning', 'tomorrow-evening', 'weekend']);
    expect(w[0]).toMatchObject({ start: '2026-10-28T22:00:00.000Z', end: '2026-10-29T03:00:00.000Z' });
    expect(w[1]).toMatchObject({ start: '2026-10-29T11:00:00.000Z', end: '2026-10-29T15:00:00.000Z' });
    // Saturday 31 Oct, 9 AM–6 PM.
    expect(w[3]).toMatchObject({ start: '2026-10-31T13:00:00.000Z', end: '2026-10-31T22:00:00.000Z' });
  });

  it('starts tonight from now (next quarter hour) in the evening, and drops it late', () => {
    const evening = windowOptions(new Date('2026-10-28T23:07:00Z'), TZ);
    expect(evening[0]).toMatchObject({ id: 'tonight', start: '2026-10-28T23:15:00.000Z' });
    expect(windowOptions(new Date('2026-10-29T02:45:00Z'), TZ)[0]?.id).toBe('tomorrow-morning');
  });

  it('skips to the following Saturday on Friday', () => {
    const friday = new Date('2026-10-30T16:00:00Z');
    expect(windowOptions(friday, TZ).find((w) => w.id === 'weekend')?.start).toBe('2026-11-07T14:00:00.000Z');
  });
});

describe('expiry', () => {
  it('always offers the window end, then the start and two hours when they fit', () => {
    const tonight = windowOptions(NOW, TZ)[0]!;
    expect(expiryOptions(tonight, NOW, TZ)).toEqual([
      { id: 'window-end', label: 'When it ends · 11 PM', at: '2026-10-29T03:00:00.000Z' },
      { id: 'window-start', label: 'When it starts · 6 PM', at: '2026-10-28T22:00:00.000Z' },
      { id: 'two-hours', label: 'In 2 hours · 6:15 PM', at: '2026-10-28T22:15:00.000Z' },
    ]);
    const late = new Date('2026-10-29T02:00:00Z');
    expect(expiryOptions({ start: '2026-10-29T02:00:00Z', end: '2026-10-29T03:00:00Z' }, late, TZ).map((e) => e.id)).toEqual([
      'window-end',
    ]);
  });
});

describe('validation and arguments', () => {
  const windows = windowOptions(NOW, TZ);
  const form: DownForForm = {
    sportId: 'football',
    windowId: 'tonight',
    expiryId: 'window-end',
    audience: 'public',
    radiusKm: 3,
  };

  it('needs a sport, a window and an expiry', () => {
    expect(validateDownFor(form, windows, NOW, TZ)).toEqual({});
    expect(hasErrors({})).toBe(false);
    const errors = validateDownFor({ ...form, sportId: null, expiryId: null }, windows, NOW, TZ);
    expect(errors).toEqual({ sport: 'Pick a sport.', expiry: 'Say until when you are down.' });
    expect(hasErrors(errors)).toBe(true);
    expect(validateDownFor({ ...form, windowId: null }, windows, NOW, TZ)).toEqual({ window: 'Pick when you can play.' });
  });

  it('catches a window or expiry that passed while the sheet was open', () => {
    const later = new Date('2026-10-29T03:30:00Z');
    expect(validateDownFor(form, windows, later, TZ).window).toBe('That time has passed. Pick another.');
    const afterStart = new Date('2026-10-28T22:20:00Z');
    expect(validateDownFor({ ...form, expiryId: 'window-start' }, windows, afterStart, TZ).expiry).toBe(
      'Say until when you are down.',
    );
    const stale = [{ id: 'tonight' as const, label: 'Tonight', start: '2026-10-28T19:00:00Z', end: '2026-10-28T20:02:00Z' }];
    expect(validateDownFor(form, stale, NOW, TZ).expiry).toBe('Pick an end time that is still to come.');
  });

  it('builds the call', () => {
    expect(downForArgs(form, windows, NOW, TZ)).toEqual({
      p_sport_id: 'football',
      p_window_start: '2026-10-28T22:00:00.000Z',
      p_window_end: '2026-10-29T03:00:00.000Z',
      p_expires_at: '2026-10-29T03:00:00.000Z',
      p_audience: 'public',
      p_radius_km: 3,
    });
    expect(downForArgs({ ...form, sportId: null }, windows, NOW, TZ)).toBeNull();
    expect(downForArgs({ ...form, windowId: null }, windows, NOW, TZ)).toBeNull();
  });
});

describe('one-tap tonight', () => {
  it('matches the people already down', () => {
    expect(tonightArgs('football', '2026-10-29T01:30:00Z', NOW, TZ)).toEqual({
      p_sport_id: 'football',
      p_window_start: '2026-10-28T22:00:00.000Z',
      p_window_end: '2026-10-29T01:30:00.000Z',
      p_expires_at: '2026-10-29T01:30:00.000Z',
    });
  });

  it('falls back to 11 PM and refuses when too little is left', () => {
    expect(tonightArgs('football', null, NOW, TZ)?.p_window_end).toBe('2026-10-29T03:00:00.000Z');
    expect(tonightArgs('football', '2026-10-28T20:20:00Z', NOW, TZ)).toBeNull();
    expect(tonightArgs('football', null, new Date('2026-10-29T02:45:00Z'), TZ)).toBeNull();
  });
});

describe('signalLine', () => {
  it('says what you are down for and until when', () => {
    expect(
      signalLine({ sport_name: 'Football', window_start: '2026-10-28T22:00:00Z', expires_at: '2026-10-29T03:00:00Z' }, NOW, TZ),
    ).toBe("You're down for football tonight until 11 PM.");
    expect(
      signalLine({ sport_name: 'Running', window_start: '2026-10-29T11:00:00Z', expires_at: '2026-10-29T15:00:00Z' }, NOW, TZ),
    ).toBe("You're down for running tomorrow until 11 AM.");
    expect(
      signalLine({ sport_name: 'Running', window_start: '2026-10-28T13:00:00Z', expires_at: '2026-10-28T20:30:00Z' }, NOW, TZ),
    ).toBe("You're down for running today until 4:30 PM.");
  });
});
