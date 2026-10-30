/**
 * Pure moderation logic for the admin screens: queue filters, severity words, which actions a case
 * allows, what can be undone, and form validation. Server rules live in docs/TRUST_CONTRACT.md; the
 * server re-checks everything, so these only decide what to offer.
 */
import { HIDEABLE_KINDS, NOTE_TO_USER_MAX, PAUSE_MAX_DAYS, REASON_MAX, isHideable } from '@ojoro/contracts';

export { HIDEABLE_KINDS, PAUSE_MAX_DAYS, REASON_MAX };

export const CASE_STATUSES = ['open', 'reviewing', 'actioned', 'dismissed'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];
export const SEVERITIES = ['high', 'medium', 'low'] as const;
export type Severity = (typeof SEVERITIES)[number];
export const REPORT_REASONS = ['spam', 'harassment', 'unsafe', 'impersonation', 'inappropriate', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const SUBJECT_KINDS = [
  'profile',
  'plan',
  'activity',
  'moment',
  'result',
  'message',
  'update',
  'call_out',
  'challenge_event',
  'challenge_post',
  'challenge_comment',
  'rivalry',
  'crew',
  'clan',
  'clan_run',
  'clash',
  'host_program',
  'place',
] as const;
export const APPEAL_STATUSES = ['open', 'upheld', 'denied'] as const;
export const APPEAL_KINDS = ['account_pause', 'content_hidden', 'show_up'] as const;
export const NOTE_MAX = NOTE_TO_USER_MAX;

export type QueueFilters = {
  p_status: CaseStatus[];
  p_severity: Severity[] | null;
  p_kinds: string[] | null;
  p_assigned: 'me' | 'unassigned' | null;
};

function pick<T extends string>(raw: string | undefined, allowed: readonly T[]): T[] {
  if (!raw) return [];
  return raw.split(',').filter((v): v is T => (allowed as readonly string[]).includes(v));
}

/** URL params → staff_queue filters. Default status is the working set: open and reviewing. */
export function queueFilters(params: Record<string, string>): QueueFilters {
  const status = pick(params.status, CASE_STATUSES);
  const severity = pick(params.severity, SEVERITIES);
  const kinds = pick(params.kind, SUBJECT_KINDS);
  const assigned = params.assigned === 'me' || params.assigned === 'unassigned' ? params.assigned : null;
  return {
    p_status: status.length ? status : ['open', 'reviewing'],
    p_severity: severity.length ? severity : null,
    p_kinds: kinds.length ? kinds : null,
    p_assigned: assigned,
  };
}

export function severityRank(s: string | null | undefined): number {
  return s === 'high' ? 3 : s === 'medium' ? 2 : s === 'low' ? 1 : 0;
}

export function severityWord(s: string | null | undefined): string {
  return s === 'high' ? 'High' : s === 'medium' ? 'Medium' : s === 'low' ? 'Low' : 'Unknown';
}

export function statusWord(s: string | null | undefined): string {
  switch (s) {
    case 'open':
      return 'Open';
    case 'reviewing':
      return 'Reviewing';
    case 'actioned':
      return 'Actioned';
    case 'dismissed':
      return 'Dismissed';
    case 'upheld':
      return 'Upheld';
    case 'denied':
      return 'Denied';
    default:
      return 'Unknown';
  }
}

export function kindWord(kind: string | null | undefined): string {
  const words: Record<string, string> = {
    profile: 'Profile',
    plan: 'Plan',
    activity: 'Game',
    moment: 'Photo',
    result: 'Result',
    message: 'Message',
    update: 'Game update',
    call_out: 'Call-Out',
    challenge_event: 'Challenge',
    challenge_post: 'Challenge post',
    challenge_comment: 'Challenge comment',
    rivalry: 'Rivalry',
    crew: 'Crew',
    clan: 'Clan',
    clan_run: 'Clan run',
    clash: 'Clash',
    host_program: 'Host program',
    place: 'Place',
    account_pause: 'Account pause',
    content_hidden: 'Hidden content',
    show_up: 'Show-up record',
  };
  if (!kind) return 'Unknown';
  return words[kind] ?? kind.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export function reasonWord(reason: string | null | undefined): string {
  const words: Record<string, string> = {
    spam: 'Spam',
    harassment: 'Harassment',
    unsafe: 'Unsafe',
    impersonation: 'Impersonation',
    inappropriate: 'Inappropriate',
    other: 'Other',
  };
  return reason ? (words[reason] ?? reason) : '–';
}

/** Open cases waiting longer than this get a heavier "waiting" tag. */
export const WAITING_LONG_MS = 24 * 3_600_000;

export function isWaitingLong(openedAt: string | null | undefined, status: string, now = Date.now()): boolean {
  if (!openedAt || (status !== 'open' && status !== 'reviewing')) return false;
  return now - Date.parse(openedAt) > WAITING_LONG_MS;
}

export type CaseFacts = {
  status: string;
  subject_kind: string;
  subject_exists: boolean;
  content_hidden: boolean;
  hide_id: string | null;
  owner: { id: string; paused: boolean; is_staff?: boolean } | null;
  assigned_to_me: boolean;
  assigned: boolean;
};

export type CaseAction =
  | 'assign_me'
  | 'unassign'
  | 'hide'
  | 'restore_content'
  | 'pause'
  | 'restore_account'
  | 'resolve_actioned'
  | 'resolve_dismissed';

/** The actions to offer on a case, in screen order. */
export function caseActions(c: CaseFacts): CaseAction[] {
  const closed = c.status === 'actioned' || c.status === 'dismissed';
  const out: CaseAction[] = [];
  if (!closed) {
    if (!c.assigned_to_me) out.push('assign_me');
    if (c.assigned) out.push('unassign');
  }
  if (c.content_hidden && c.hide_id) out.push('restore_content');
  else if (!closed && c.subject_exists && isHideable(c.subject_kind)) out.push('hide');
  if (c.owner) {
    if (c.owner.paused) out.push('restore_account');
    else if (!closed && !c.owner.is_staff) out.push('pause');
  }
  if (!closed) out.push('resolve_actioned', 'resolve_dismissed');
  return out;
}

export type Undo =
  | { kind: 'restore_content'; hide_id: string }
  | { kind: 'hide'; subject_kind: string; subject_id: string; case_id: string | null }
  | { kind: 'restore_account'; user_id: string }
  | { kind: 'unassign'; case_id: string }
  | { kind: 'place_sensitive'; place_id: string; sensitive: boolean };

/**
 * What undoes an action, where the contract allows one. Resolving a case and deciding an appeal are
 * final (history is never rewritten), so they have none; re-pausing after a restore needs a fresh
 * decision, so it has none either.
 */
export function undoFor(
  action: CaseAction | 'place_sensitive',
  ctx: { changed: boolean; hide_id?: string | null; subject_kind?: string; subject_id?: string; case_id?: string | null; user_id?: string; place_id?: string; sensitive?: boolean },
): Undo | null {
  if (!ctx.changed) return null;
  switch (action) {
    case 'hide':
      return ctx.hide_id ? { kind: 'restore_content', hide_id: ctx.hide_id } : null;
    case 'restore_content':
      return ctx.subject_kind && ctx.subject_id
        ? { kind: 'hide', subject_kind: ctx.subject_kind, subject_id: ctx.subject_id, case_id: ctx.case_id ?? null }
        : null;
    case 'pause':
      return ctx.user_id ? { kind: 'restore_account', user_id: ctx.user_id } : null;
    case 'assign_me':
      return ctx.case_id ? { kind: 'unassign', case_id: ctx.case_id } : null;
    case 'place_sensitive':
      return ctx.place_id !== undefined && ctx.sensitive !== undefined
        ? { kind: 'place_sensitive', place_id: ctx.place_id, sensitive: !ctx.sensitive }
        : null;
    default:
      return null;
  }
}

/** The reason recorded for an undo: the audit log says it was an undo and why the first action was taken. */
export function undoReason(original: string): string {
  return `Undo right after: ${original}`.slice(0, REASON_MAX);
}

export function validateReason(reason: string): string | null {
  const r = reason.trim();
  if (!r) return 'Write a reason. It goes in the audit log.';
  if (r.length > REASON_MAX) return `Keep the reason to ${REASON_MAX} characters (now ${r.length}).`;
  return null;
}

export function validateNote(note: string): string | null {
  return note.trim().length > NOTE_MAX ? `Keep the note to ${NOTE_MAX} characters (now ${note.trim().length}).` : null;
}

/** null end = until restored. Otherwise in the future and at most 365 days away. */
export function validatePauseEnd(endsAtIso: string | null, now = Date.now()): string | null {
  if (endsAtIso === null) return null;
  const t = Date.parse(endsAtIso);
  if (Number.isNaN(t)) return 'Pick a valid end date, or choose until restored.';
  if (t <= now) return 'Pick an end date in the future.';
  if (t - now > PAUSE_MAX_DAYS * 86_400_000) return `Pick an end date at most ${PAUSE_MAX_DAYS} days away.`;
  return null;
}

/** Cursor paging: a stack of cursors, one per page already seen. Page 1's cursor is null. */
export type CursorStack = (string | null)[];

export function nextStack(stack: CursorStack, nextCursor: string | null): CursorStack {
  return nextCursor ? [...stack, nextCursor] : stack;
}

export function prevStack(stack: CursorStack): CursorStack {
  return stack.length > 1 ? stack.slice(0, -1) : [null];
}

export function currentCursor(stack: CursorStack): string | null {
  return stack[stack.length - 1] ?? null;
}
