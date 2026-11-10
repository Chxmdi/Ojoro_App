/**
 * Deleting your own account (docs/TRUST_CONTRACT.md, "Deleting your own account"): the `account-delete`
 * Edge Function, the `account_deletion_check` RPC, and the words both the app and the public web page use.
 */

export const accountDeleteFunction = 'account-delete' as const;

/** What the person types to confirm; the function refuses anything else. */
export const accountDeleteConfirmWord = 'DELETE' as const;

export const accountErrorCodes = ['account_delete_staff', 'account_delete_blocked'] as const;

export type AccountDeletionBlockerKind = 'staff' | 'dispute_open' | 'refund_pending' | 'payout_pending';

export interface AccountDeletionBlocker {
  kind: AccountDeletionBlockerKind;
  program_id: string | null;
  program_name: string | null;
}

/** `account_deletion_check()`. */
export interface AccountDeletionCheck {
  can_delete: boolean;
  blockers: AccountDeletionBlocker[];
}

export interface AccountDeleteRequest {
  confirm: typeof accountDeleteConfirmWord;
  source?: 'app' | 'web';
}

export interface AccountDeleteResult {
  status: 'deleted' | 'already_deleted';
}

/** Typed exactly (case and spaces ignored at the ends): DELETE. */
export function isDeleteConfirmed(typed: string): boolean {
  return typed.trim().toUpperCase() === accountDeleteConfirmWord;
}

function program(b: AccountDeletionBlocker): string {
  return b.program_name ?? 'A program you run';
}

/** One plain sentence per blocker: what is in the way and what to do first. */
export function accountBlockerSentence(b: AccountDeletionBlocker): string {
  switch (b.kind) {
    case 'staff':
      return "Staff accounts can't be deleted here. Ask an Ojoro admin to remove your staff role first.";
    case 'dispute_open':
      return `${program(b)} has an open payment dispute. Wait until it's closed, then delete.`;
    case 'refund_pending':
      return `${program(b)} has a refund still going back to someone. Wait until it's done, then delete.`;
    case 'payout_pending':
      return `${program(b)} has money that hasn't been paid out to you yet. Wait for the payout to arrive, then delete.`;
  }
}

/** What goes, and what stays as "Former member" (the same words in the app and on the web page). */
export const accountDeletionGoes = [
  'Your profile, photo, area and settings',
  'Your messages, posts, photos and comments',
  'Your Passport, goals and personal bests',
  'Your crew and clan memberships, and your reports and appeals',
] as const;

export const accountDeletionStays = [
  'Games, results and Challenges you were part of, so other people keep theirs',
  'Crews and clans you started, for the people still in them',
  'Programs you run, archived: nothing new is scheduled',
  'What you paid a host, in their records',
] as const;

export const formerMemberName = 'Former member' as const;

/** Reads the blockers off the function's 409 body (`{ error, blockers }`). */
export function blockersOf(body: unknown): AccountDeletionBlocker[] {
  if (!body || typeof body !== 'object') return [];
  const raw = (body as { blockers?: unknown }).blockers;
  if (!Array.isArray(raw)) return [];
  const kinds: readonly string[] = ['staff', 'dispute_open', 'refund_pending', 'payout_pending'];
  return raw.flatMap((x) => {
    if (!x || typeof x !== 'object') return [];
    const r = x as Record<string, unknown>;
    if (typeof r.kind !== 'string' || !kinds.includes(r.kind)) return [];
    return [
      {
        kind: r.kind as AccountDeletionBlockerKind,
        program_id: typeof r.program_id === 'string' ? r.program_id : null,
        program_name: typeof r.program_name === 'string' ? r.program_name : null,
      },
    ];
  });
}
