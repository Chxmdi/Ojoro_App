/**
 * The public "Delete your Ojoro account" page (delete-account/index.html): reading what the
 * `account-delete` Edge Function answered. Pure, so it is tested in Node. Contract:
 * docs/TRUST_CONTRACT.md, "Deleting your own account".
 */
import {
  accountBlockerSentence,
  blockersOf,
  paymentsFunctionError,
  toOjoroError,
} from '@ojoro/contracts';

import { errorWords } from './errors';

export type DeleteOutcome =
  { kind: 'deleted' } | { kind: 'blocked'; sentences: string[] } | { kind: 'error'; words: string };

/** What the function said, as the page shows it. `status` 0: no answer (offline). */
export function deleteOutcome(status: number, body: unknown): DeleteOutcome {
  if (status === 0)
    return {
      kind: 'error',
      words: errorWords({ ojoro: { kind: 'network', code: 'network', detail: null } }),
    };
  if (status >= 200 && status < 300) {
    const s = (body as { status?: unknown } | null)?.status;
    if (s === 'deleted' || s === 'already_deleted') return { kind: 'deleted' };
  }
  const parsed = paymentsFunctionError(body);
  if (parsed) {
    const blockers = blockersOf(body);
    if (blockers.length > 0)
      return { kind: 'blocked', sentences: blockers.map(accountBlockerSentence) };
    if (parsed.message === 'account_delete_staff') {
      return {
        kind: 'blocked',
        sentences: [
          accountBlockerSentence({ kind: 'staff', program_id: null, program_name: null }),
        ],
      };
    }
    return { kind: 'error', words: errorWords({ ojoro: toOjoroError(parsed) }) };
  }
  return {
    kind: 'error',
    words: errorWords({ ojoro: { kind: 'unknown', code: 'unknown', detail: null } }),
  };
}

/** "+1 ••• ••• 0100". */
export function maskE164(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  if (digits.length < 4) return e164;
  const country = digits.length > 10 ? `+${digits.slice(0, digits.length - 10)} ` : '';
  return `${country}••• ••• ${digits.slice(-4)}`;
}
