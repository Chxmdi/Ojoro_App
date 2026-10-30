import { describe, expect, it } from 'vitest';

import {
  caseActions,
  currentCursor,
  isWaitingLong,
  kindWord,
  nextStack,
  prevStack,
  queueFilters,
  reasonWord,
  severityRank,
  severityWord,
  statusWord,
  undoFor,
  undoReason,
  validateNote,
  validatePauseEnd,
  validateReason,
  type CaseFacts,
} from './moderation';

const base: CaseFacts = {
  status: 'open',
  subject_kind: 'message',
  subject_exists: true,
  content_hidden: false,
  hide_id: null,
  owner: { id: 'u1', paused: false },
  assigned_to_me: false,
  assigned: false,
};

describe('queueFilters', () => {
  it('defaults to the working set', () => {
    expect(queueFilters({})).toEqual({ p_status: ['open', 'reviewing'], p_severity: null, p_kinds: null, p_assigned: null });
  });
  it('keeps only known values', () => {
    expect(queueFilters({ status: 'actioned,bogus', severity: 'high,low', kind: 'message,nope', assigned: 'me' })).toEqual({
      p_status: ['actioned'],
      p_severity: ['high', 'low'],
      p_kinds: ['message'],
      p_assigned: 'me',
    });
    expect(queueFilters({ assigned: 'x' }).p_assigned).toBeNull();
    expect(queueFilters({ assigned: 'unassigned' }).p_assigned).toBe('unassigned');
  });
});

describe('words', () => {
  it('severity', () => {
    expect(['high', 'medium', 'low', null].map(severityRank)).toEqual([3, 2, 1, 0]);
    expect(['high', 'medium', 'low', 'x'].map(severityWord)).toEqual(['High', 'Medium', 'Low', 'Unknown']);
  });
  it('status, kind and reason', () => {
    expect(['open', 'reviewing', 'actioned', 'dismissed', 'upheld', 'denied', null].map(statusWord)).toEqual([
      'Open',
      'Reviewing',
      'Actioned',
      'Dismissed',
      'Upheld',
      'Denied',
      'Unknown',
    ]);
    expect(kindWord('activity')).toBe('Game');
    expect(kindWord('new_kind')).toBe('New kind');
    expect(kindWord(null)).toBe('Unknown');
    expect(reasonWord('unsafe')).toBe('Unsafe');
    expect(reasonWord('later')).toBe('later');
    expect(reasonWord(null)).toBe('–');
  });
  it('waiting long', () => {
    const now = Date.parse('2026-10-30T12:00:00Z');
    expect(isWaitingLong('2026-10-29T10:00:00Z', 'open', now)).toBe(true);
    expect(isWaitingLong('2026-10-30T10:00:00Z', 'open', now)).toBe(false);
    expect(isWaitingLong('2026-10-20T10:00:00Z', 'dismissed', now)).toBe(false);
    expect(isWaitingLong(null, 'open', now)).toBe(false);
  });
});

describe('caseActions', () => {
  it('offers the full set on an open message case', () => {
    expect(caseActions(base)).toEqual(['assign_me', 'hide', 'pause', 'resolve_actioned', 'resolve_dismissed']);
  });
  it('offers unassign and restore when assigned to me, hidden and paused', () => {
    expect(
      caseActions({ ...base, status: 'reviewing', assigned: true, assigned_to_me: true, content_hidden: true, hide_id: 'h', owner: { id: 'u', paused: true } }),
    ).toEqual(['unassign', 'restore_content', 'restore_account', 'resolve_actioned', 'resolve_dismissed']);
  });
  it('never hides kinds that cannot be hidden, and never pauses staff', () => {
    expect(caseActions({ ...base, subject_kind: 'profile', owner: { id: 'u', paused: false, is_staff: true } })).toEqual([
      'assign_me',
      'resolve_actioned',
      'resolve_dismissed',
    ]);
  });
  it('keeps only restores on a closed case', () => {
    expect(caseActions({ ...base, status: 'actioned', content_hidden: true, hide_id: 'h', owner: { id: 'u', paused: true } })).toEqual([
      'restore_content',
      'restore_account',
    ]);
    expect(caseActions({ ...base, status: 'dismissed', owner: null })).toEqual([]);
  });
});

describe('undo', () => {
  it('maps reversible actions', () => {
    expect(undoFor('hide', { changed: true, hide_id: 'h' })).toEqual({ kind: 'restore_content', hide_id: 'h' });
    expect(undoFor('hide', { changed: true })).toBeNull();
    expect(undoFor('restore_content', { changed: true, subject_kind: 'message', subject_id: 's', case_id: 'c' })).toEqual({
      kind: 'hide',
      subject_kind: 'message',
      subject_id: 's',
      case_id: 'c',
    });
    expect(undoFor('restore_content', { changed: true, subject_kind: 'message', subject_id: 's' })).toMatchObject({ case_id: null });
    expect(undoFor('restore_content', { changed: true })).toBeNull();
    expect(undoFor('pause', { changed: true, user_id: 'u' })).toEqual({ kind: 'restore_account', user_id: 'u' });
    expect(undoFor('pause', { changed: true })).toBeNull();
    expect(undoFor('assign_me', { changed: true, case_id: 'c' })).toEqual({ kind: 'unassign', case_id: 'c' });
    expect(undoFor('assign_me', { changed: true })).toBeNull();
    expect(undoFor('place_sensitive', { changed: true, place_id: 'p', sensitive: true })).toEqual({
      kind: 'place_sensitive',
      place_id: 'p',
      sensitive: false,
    });
    expect(undoFor('place_sensitive', { changed: true })).toBeNull();
  });
  it('has none for final or unchanged actions', () => {
    expect(undoFor('resolve_actioned', { changed: true })).toBeNull();
    expect(undoFor('restore_account', { changed: true, user_id: 'u' })).toBeNull();
    expect(undoFor('hide', { changed: false, hide_id: 'h' })).toBeNull();
  });
  it('writes the undo reason', () => {
    expect(undoReason('Spam link')).toBe('Undo right after: Spam link');
    expect(undoReason('x'.repeat(600))).toHaveLength(500);
  });
});

describe('validation', () => {
  it('reason and note', () => {
    expect(validateReason('  ')).toMatch(/Write a reason/);
    expect(validateReason('x'.repeat(501))).toMatch(/500/);
    expect(validateReason('Threats in chat')).toBeNull();
    expect(validateNote('x'.repeat(501))).toMatch(/500/);
    expect(validateNote('ok')).toBeNull();
  });
  it('pause end', () => {
    const now = Date.parse('2026-10-30T12:00:00Z');
    expect(validatePauseEnd(null, now)).toBeNull();
    expect(validatePauseEnd('nope', now)).toMatch(/valid/);
    expect(validatePauseEnd('2026-10-29T12:00:00Z', now)).toMatch(/future/);
    expect(validatePauseEnd('2028-01-01T00:00:00Z', now)).toMatch(/365/);
    expect(validatePauseEnd('2026-11-06T12:00:00Z', now)).toBeNull();
  });
});

describe('cursor stack', () => {
  it('pages forward and back', () => {
    let s = [null] as (string | null)[];
    expect(currentCursor(s)).toBeNull();
    s = nextStack(s, 'c2');
    expect(currentCursor(s)).toBe('c2');
    expect(nextStack(s, null)).toBe(s);
    s = prevStack(s);
    expect(s).toEqual([null]);
    expect(prevStack(s)).toEqual([null]);
    expect(currentCursor([])).toBeNull();
  });
});
