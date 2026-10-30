import { describe, expect, it } from 'vitest';
import {
  APPEAL_MESSAGE_MAX,
  PAUSED_HEADLINE,
  appealMessageError,
  appealStatusLabel,
  compareCases,
  isHideable,
  pausedExemptRpcs,
  pausedReason,
  pausedUntil,
  reportCountLine,
  reportReasonLabel,
  severityLabel,
  staffReadRpcs,
  staffRpcs,
  submitAppealArgs,
  trustErrorCodes,
  trustIdempotentRpcs,
  trustRpcs,
  type StaffCaseSummary,
} from './trust';
import { idempotentRpcs, isOjoroErrorCode } from './slice01';

function summary(severity: StaffCaseSummary['severity'], openedAt: string): StaffCaseSummary {
  return {
    id: openedAt,
    subject_kind: 'message',
    subject_id: 'x',
    status: 'open',
    severity,
    reasons: ['spam'],
    report_count: 1,
    reporter_count: 1,
    opened_at: openedAt,
    last_reported_at: openedAt,
    resolved_at: null,
    preview: null,
    owner: null,
    assigned_to: null,
    content_hidden: false,
  };
}

describe('trust contract', () => {
  it('registers its error codes', () => {
    for (const code of trustErrorCodes) expect(isOjoroErrorCode(code)).toBe(true);
  });

  it('lists every idempotent RPC among the RPCs and in idempotentRpcs', () => {
    const all: readonly string[] = [...trustRpcs, ...staffRpcs];
    for (const rpc of trustIdempotentRpcs) {
      expect(all).toContain(rpc);
      expect(idempotentRpcs).toContain(rpc);
    }
  });

  it('keeps staff reads within the staff RPCs and the exempt RPCs within the app ones', () => {
    for (const rpc of staffReadRpcs) expect(staffRpcs).toContain(rpc);
    for (const rpc of pausedExemptRpcs) expect(trustRpcs).toContain(rpc);
    for (const rpc of staffRpcs) expect(rpc.startsWith('staff_')).toBe(true);
  });

  it('says how long a pause lasts', () => {
    expect(pausedUntil('2026-11-12T15:00:00Z')).toBe('Until 12 November.');
    expect(pausedUntil(null)).toBe('Until Ojoro restores it.');
    expect(pausedUntil('not a date')).toBe('Until Ojoro restores it.');
    expect(PAUSED_HEADLINE).toBe('This account is paused');
  });

  it('puts reasons and appeal states into words without exclamation marks', () => {
    expect(pausedReason('harassment')).toBe('Paused for harassment.');
    expect(reportReasonLabel('unsafe')).toBe('Something unsafe');
    for (const s of ['open', 'upheld', 'denied'] as const) {
      expect(appealStatusLabel(s)).not.toContain('!');
    }
    expect(severityLabel('high')).toBe('HIGH');
  });

  it('counts reports and people', () => {
    expect(reportCountLine(1, 1)).toBe('1 report from 1 person.');
    expect(reportCountLine(3, 2)).toBe('3 reports from 2 people.');
  });

  it('orders a queue high first, then oldest', () => {
    const list = [
      summary('low', '2026-10-01T00:00:00Z'),
      summary('high', '2026-10-03T00:00:00Z'),
      summary('high', '2026-10-02T00:00:00Z'),
      summary('medium', '2026-10-01T00:00:00Z'),
    ].sort(compareCases);
    expect(list.map((c) => `${c.severity}:${c.opened_at.slice(8, 10)}`)).toEqual([
      'high:02',
      'high:03',
      'medium:01',
      'low:01',
    ]);
    expect(compareCases(summary('low', 'a'), summary('low', 'a'))).toBe(0);
  });

  it('knows what can be hidden', () => {
    expect(isHideable('moment')).toBe(true);
    expect(isHideable('profile')).toBe(false);
  });

  it('builds appeal args and checks the message', () => {
    expect(submitAppealArgs('show_up', 'a1', '  I was there.  ', 'k1')).toEqual({
      p_kind: 'show_up',
      p_subject_id: 'a1',
      p_message: 'I was there.',
      p_idempotency_key: 'k1',
    });
    expect(appealMessageError('   ')).toBe('empty');
    expect(appealMessageError('x'.repeat(APPEAL_MESSAGE_MAX + 1))).toBe('too_long');
    expect(appealMessageError('I was there.')).toBeNull();
  });
});
