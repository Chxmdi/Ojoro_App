import { describe, expect, it } from 'vitest';

import { auditActionsFilter, auditWord, detailText, isRead, READ_ACTIONS, WRITE_ACTIONS } from './audit';

describe('audit words', () => {
  it('names actions', () => {
    expect(auditWord('pause_account')).toBe('Paused account');
    expect(auditWord('something_new')).toBe('Something new');
    expect(isRead('view_case')).toBe(true);
    expect(isRead('find_users')).toBe(true);
    expect(isRead('hide_content')).toBe(false);
    expect(WRITE_ACTIONS).not.toContain('view_queue');
    expect(READ_ACTIONS).toContain('view_queue');
  });
  it('flattens detail as text', () => {
    expect(detailText(null)).toBe('');
    expect(detailText('x')).toBe('x');
    expect(detailText({ ends_at: '2026', changed: true, empty: '', nested: { a: 1 }, list: ['open', 'reviewing'] })).toBe(
      'ends at: 2026 · changed: true · nested: {"a":1} · list: open, reviewing',
    );
  });
  it('filters', () => {
    expect(auditActionsFilter(undefined)).toBeNull();
    expect(auditActionsFilter('writes')).toEqual(WRITE_ACTIONS);
    expect(auditActionsFilter('reads')).toEqual(READ_ACTIONS);
    expect(auditActionsFilter('hide_content')).toEqual(['hide_content']);
    expect(auditActionsFilter('bogus')).toBeNull();
  });
});
