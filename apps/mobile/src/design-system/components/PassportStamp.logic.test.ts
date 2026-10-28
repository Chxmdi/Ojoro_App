import { describe, expect, it } from 'vitest';

import { STAMP_DEFAULT_KIND, STAMP_TILT, stampModel } from './PassportStamp.logic';

describe('stampModel', () => {
  const base = { title: '21 GAMES', place: 'Jeanne-Mance', date: '06.10.26' };

  it('tilts by default and labels like the web', () => {
    const m = stampModel(base);
    expect(m.rotate).toBe(STAMP_TILT);
    expect(m.kind).toBe(STAMP_DEFAULT_KIND);
    expect(m.accessibilityLabel).toBe('21 GAMES, Jeanne-Mance, 06.10.26');
  });

  it('sits flat only when tilt is false', () => {
    expect(stampModel({ ...base, tilt: false }).rotate).toBeNull();
    expect(stampModel({ ...base, tilt: true }).rotate).toBe(STAMP_TILT);
  });

  it('uses the given kind, or the default for an empty one', () => {
    expect(stampModel({ ...base, kind: 'NEW STAMP' }).kind).toBe('NEW STAMP');
    expect(stampModel({ ...base, kind: '' }).kind).toBe(STAMP_DEFAULT_KIND);
  });
});
