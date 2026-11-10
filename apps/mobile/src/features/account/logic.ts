/**
 * Deleting your own account (docs/TRUST_CONTRACT.md, "Deleting your own account"): reading what the
 * `account-delete` function answered, and the masked phone line on Settings → Account.
 */
import {
  blockersOf,
  paymentsFunctionError,
  toOjoroError,
  type AccountDeletionBlocker,
  type OjoroError,
} from '@ojoro/contracts';

export type DeleteFailure = { error: OjoroError; blockers: AccountDeletionBlocker[] };

/**
 * What a failed call to `account-delete` means: the code (with words in errorMessages.ts) and, for
 * account_delete_blocked, the blockers. `status` 0 is no answer at all (offline).
 */
export function deleteFailure(status: number, body: unknown): DeleteFailure {
  if (status === 0) return { error: { kind: 'network', code: 'network', detail: null }, blockers: [] };
  const parsed = paymentsFunctionError(body);
  if (parsed) return { error: toOjoroError(parsed), blockers: blockersOf(body) };
  return { error: { kind: 'ojoro', code: 'account_delete_failed', detail: null }, blockers: [] };
}

/** "+1 ••• ••• 0100": enough to know which account, not the whole number on screen. */
export function maskedPhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 4) return null;
  const last = digits.slice(-4);
  const country = digits.length > 10 ? `+${digits.slice(0, digits.length - 10)} ` : '';
  return `${country}••• ••• ${last}`;
}
