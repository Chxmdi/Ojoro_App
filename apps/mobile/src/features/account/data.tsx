/**
 * Reads and writes for deleting your own account (docs/TRUST_CONTRACT.md, "Deleting your own account").
 * The check is an RPC; the deletion is the `account-delete` Edge Function, which re-checks the JWT and
 * uses the service role server side only. After it answers deleted (or already deleted), this device
 * signs out locally: the session no longer has an account behind it.
 */
import {
  accountDeleteConfirmWord,
  accountDeleteFunction,
  type AccountDeleteResult,
  type AccountDeletionCheck,
} from '@ojoro/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';

import { track } from '@/lib/analytics';
import { queryClient } from '@/lib/query';
import { OjoroCallError, rpc } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

import { deleteFailure, type DeleteFailure } from './logic';

export const accountKeys = { deletionCheck: (userId: string) => ['account', 'deletion-check', userId] as const };

export function useDeletionCheck(userId: string) {
  return useQuery({
    queryKey: accountKeys.deletionCheck(userId),
    queryFn: async () => (await rpc('account_deletion_check', {})) as unknown as AccountDeletionCheck,
  });
}

/** A failed deletion: the code for the words, and what blocks it. */
export class DeleteAccountError extends OjoroCallError {
  readonly blockers: DeleteFailure['blockers'];
  constructor(f: DeleteFailure) {
    super(f.error);
    this.blockers = f.blockers;
  }
}

async function callDelete(): Promise<AccountDeleteResult> {
  const { data, error } = await supabase.functions.invoke(accountDeleteFunction, {
    body: { confirm: accountDeleteConfirmWord, source: 'app' },
  });
  if (!error) return data as AccountDeleteResult;
  if ((error as { name?: string }).name === 'FunctionsFetchError') throw new DeleteAccountError(deleteFailure(0, null));
  const ctx = (error as { context?: unknown }).context;
  let status = 500;
  let body: unknown = null;
  if (ctx && typeof (ctx as Response).json === 'function') {
    status = (ctx as Response).status;
    body = await (ctx as Response)
      .clone()
      .json()
      .catch(() => null);
  }
  throw new DeleteAccountError(deleteFailure(status, body));
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: callDelete,
    onMutate: () => track('account_delete_confirmed', {}),
    onError: (e) => {
      if (e instanceof DeleteAccountError && e.blockers.length > 0) {
        track('account_delete_blocked', { kinds: e.blockers.map((b) => b.kind).join(',') });
      }
    },
    onSuccess: async () => {
      // The account is gone: drop this device's session and everything cached for it.
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      queryClient.clear();
    },
  });
}
