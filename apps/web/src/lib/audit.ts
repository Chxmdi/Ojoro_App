/** Words for audit log actions (docs/TRUST_CONTRACT.md "Actions"). */
export const AUDIT_ACTIONS = [
  'grant_staff',
  'revoke_staff',
  'assign_case',
  'resolve_case',
  'dismiss_case',
  'hide_content',
  'restore_content',
  'pause_account',
  'restore_account',
  'decide_appeal',
  'void_reputation',
  'correct_show_up',
  'set_place_sensitive',
  'view_queue',
  'view_case',
  'view_user',
  'find_users',
  'view_appeals',
  'view_appeal',
  'view_audit',
] as const;

const WORDS: Record<string, string> = {
  grant_staff: 'Granted staff',
  revoke_staff: 'Revoked staff',
  assign_case: 'Assigned case',
  unassign_case: 'Unassigned case',
  resolve_case: 'Resolved case',
  dismiss_case: 'Dismissed case',
  hide_content: 'Hid content',
  restore_content: 'Restored content',
  pause_account: 'Paused account',
  restore_account: 'Restored account',
  decide_appeal: 'Decided appeal',
  void_reputation: 'Voided reputation',
  correct_show_up: 'Corrected show-up',
  set_place_sensitive: 'Changed place sensitivity',
  view_queue: 'Viewed queue',
  view_case: 'Viewed case',
  view_user: 'Viewed person',
  find_users: 'Searched people',
  view_appeals: 'Viewed appeals',
  view_appeal: 'Viewed appeal',
  view_audit: 'Viewed audit log',
};

export function auditWord(action: string): string {
  return WORDS[action] ?? action.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export function isRead(action: string): boolean {
  return action.startsWith('view_') || action === 'find_users';
}

export const WRITE_ACTIONS = AUDIT_ACTIONS.filter((a) => !isRead(a));
export const READ_ACTIONS = AUDIT_ACTIONS.filter((a) => isRead(a));

/** Audit detail is jsonb; show it as compact "key: value" text, never as HTML. */
export function detailText(detail: unknown): string {
  if (detail === null || detail === undefined) return '';
  if (typeof detail !== 'object') return String(detail);
  return Object.entries(detail as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(
      ([k, v]) =>
        `${k.replace(/_/g, ' ')}: ${Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)}`,
    )
    .join(' · ');
}

/** Audit filter param → p_actions. */
export function auditActionsFilter(value: string | undefined): string[] | null {
  if (value === 'writes') return [...WRITE_ACTIONS];
  if (value === 'reads') return [...READ_ACTIONS];
  if (value && (AUDIT_ACTIONS as readonly string[]).includes(value)) return [value];
  return null;
}
