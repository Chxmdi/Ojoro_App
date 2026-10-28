import { describe, expect, it } from 'vitest';

import {
  blockCopy,
  firstName,
  REPORT_NOTE_MAX,
  REPORT_REASONS,
  subjectWord,
  validateReport,
} from './reasons';

describe('report reasons', () => {
  it('lists every reason the RPC takes, once', () => {
    const values = REPORT_REASONS.map((r) => r.value).sort();
    expect(values).toEqual(['harassment', 'impersonation', 'inappropriate', 'other', 'spam', 'unsafe']);
  });

  it('names each subject in plain words', () => {
    expect(subjectWord('profile')).toBe('profile');
    expect(subjectWord('activity')).toBe('game');
    expect(subjectWord('moment')).toBe('photo');
    expect(subjectWord('result')).toBe('score');
    expect(subjectWord('plan')).toBe('plan');
  });
});

describe('validateReport', () => {
  it('needs a reason', () => {
    expect(validateReport({ reason: null, note: '' })).toEqual({
      ok: false,
      error: 'Pick what happened.',
    });
  });

  it('sends no note when it is blank', () => {
    expect(validateReport({ reason: 'spam', note: '   ' })).toEqual({
      ok: true,
      reason: 'spam',
      note: null,
    });
  });

  it('trims the note', () => {
    expect(validateReport({ reason: 'unsafe', note: ' pushed me ' })).toEqual({
      ok: true,
      reason: 'unsafe',
      note: 'pushed me',
    });
  });

  it('asks for words with Something else', () => {
    expect(validateReport({ reason: 'other', note: '' }).ok).toBe(false);
    expect(validateReport({ reason: 'other', note: 'x' }).ok).toBe(true);
  });

  it('caps the note length', () => {
    const result = validateReport({ reason: 'spam', note: 'a'.repeat(REPORT_NOTE_MAX + 1) });
    expect(result.ok).toBe(false);
  });
});

describe('block copy', () => {
  it('uses the first name', () => {
    expect(firstName('Ade B')).toBe('Ade');
    expect(firstName('  Marcus  ')).toBe('Marcus');
    expect(firstName('')).toBe('');
  });

  it('says the consequences and that they are not told', () => {
    const copy = blockCopy('Ade B');
    expect(copy.title).toBe('BLOCK ADE?');
    expect(copy.body).toContain("Ade won't see you");
    expect(copy.body).toContain("isn't told");
    expect(copy.confirm).toBe('BLOCK');
  });
});
