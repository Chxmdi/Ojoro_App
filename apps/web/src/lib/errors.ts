/**
 * Error words for the staff admin tool. Codes come from the staff RPCs (docs/TRUST_CONTRACT.md
 * "Errors"); anything else falls back to plain words. Never blaming, no exclamation marks.
 */
import { toOjoroError, type OjoroError } from '@ojoro/contracts';

const WORDS: Record<string, string> = {
  not_authenticated: 'You are signed out. Sign in again.',
  not_staff: "This account isn't staff. The admin tool is for Ojoro staff only.",
  not_admin: 'Only an admin can do that.',
  staff_last_admin: "That's the last admin. Make someone else admin first.",
  case_not_found: "We can't find that case.",
  case_closed: 'That case is already closed. A new report opens a new case.',
  cannot_hide_kind:
    "That kind of thing can't be hidden. Pause its owner instead, or mark the place sensitive.",
  hide_not_found: "That isn't hidden any more.",
  cannot_pause_staff: "Staff accounts can't be paused. Revoke the staff role first.",
  pause_end_invalid: 'Pick an end date in the future, at most 365 days away.',
  reason_required: 'Write a reason (up to 500 characters). It goes in the audit log.',
  appeal_not_found: "We can't find that appeal.",
  appeal_closed: 'That appeal is already decided.',
  user_not_found: "We can't find that person.",
  subject_not_found: "We can't find that any more.",
  place_unknown: "We can't find that place.",
  invalid_argument: "Something in that isn't right. Check it and try again.",
  idempotency_key_required: "That didn't go through. Try again.",
  idempotency_key_reused: "That didn't go through. Try again.",
  account_paused: "This account is paused, so it can't use the admin tool.",
  permission_denied: "This account can't do that.",
  network: "You're offline or the server didn't answer. Check the connection and try again.",
  unknown: 'Something went wrong on our side. Try again.',
};

export function errorOf(thrown: unknown): OjoroError {
  if (thrown && typeof thrown === 'object' && 'ojoro' in thrown)
    return (thrown as { ojoro: OjoroError }).ojoro;
  return toOjoroError(thrown);
}

/** Words for anything a staff call threw. Server codes the contract adds later still read sensibly. */
export function errorWords(thrown: unknown): string {
  const e = errorOf(thrown);
  if (e.code === 'invalid_argument' && e.detail)
    return `Check ${e.detail.replace(/^p_/, '').replace(/_/g, ' ')} and try again.`;
  return WORDS[e.code] ?? WORDS.unknown!;
}

/** A failed staff call, keeping the stable code. */
export class StaffCallError extends Error {
  readonly ojoro: OjoroError;
  constructor(ojoro: OjoroError) {
    super(ojoro.code);
    this.name = 'StaffCallError';
    this.ojoro = ojoro;
  }
}
