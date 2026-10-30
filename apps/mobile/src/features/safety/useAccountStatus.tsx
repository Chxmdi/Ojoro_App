import type { AccountStatus, AppealKind, MissedGame, MyAppeal } from '@ojoro/contracts';
import { submitAppealArgs } from '@ojoro/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { newIdempotencyKey } from '@/lib/idempotency';
import { ojoroErrorOf, rpc } from '@/lib/rpc';

import { isPausedCode } from './accountStatus';

export const accountStatusKey = (userId: string) => ['account', 'status', userId] as const;
export const missedGamesKey = (userId: string) => ['account', 'missed-games', userId] as const;

/**
 * `my_account_status` for the signed-in person (works while paused). Any call that comes back
 * `account_paused` refreshes it, so the paused screen appears the moment a pause starts.
 */
export function useAccountStatus() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const userId = auth.status === 'signed-in' ? auth.session.user.id : null;

  const query = useQuery({
    queryKey: accountStatusKey(userId ?? 'none'),
    queryFn: async () => (await rpc('my_account_status', {})) as unknown as AccountStatus,
    enabled: userId !== null,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!userId) return;
    const key = accountStatusKey(userId);
    const refresh = (thrown: unknown) => {
      if (isPausedCode(ojoroErrorOf(thrown).code))
        void queryClient.invalidateQueries({ queryKey: key });
    };
    const offQueries = queryClient.getQueryCache().subscribe((event) => {
      if (
        event.type === 'updated' &&
        event.action.type === 'error' &&
        event.query.queryKey[0] !== 'account'
      ) {
        refresh(event.action.error);
      }
    });
    const offMutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') refresh(event.action.error);
    });
    return () => {
      offQueries();
      offMutations();
    };
  }, [queryClient, userId]);

  return query;
}

/** Games counted as missed in your show-up record (`my_missed_games`). */
export function useMissedGames(enabled = true) {
  const auth = useAuth();
  const userId = auth.status === 'signed-in' ? auth.session.user.id : null;
  return useQuery({
    queryKey: missedGamesKey(userId ?? 'none'),
    queryFn: async () =>
      ((await rpc('my_missed_games', { p_limit: 20 })) as unknown as { items: MissedGame[] }).items,
    enabled: enabled && userId !== null,
  });
}

/** `submit_appeal`, one key per intention (kept across retries of the same send). */
export function useSubmitAppeal(kind: AppealKind) {
  const queryClient = useQueryClient();
  const key = useRef<string | null>(null);
  return useMutation({
    mutationFn: async (args: { subjectId: string; message: string }) => {
      key.current ??= newIdempotencyKey();
      return (await rpc(
        'submit_appeal',
        submitAppealArgs(kind, args.subjectId, args.message, key.current),
      )) as unknown as MyAppeal;
    },
    onSuccess: () => {
      key.current = null;
      track('appeal_sent', { kind });
      void queryClient.invalidateQueries({ queryKey: ['account'] });
      void queryClient.invalidateQueries({ queryKey: ['passport'] });
    },
  });
}
