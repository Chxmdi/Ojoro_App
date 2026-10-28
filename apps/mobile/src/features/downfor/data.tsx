/** Down For reads and writes (contract: create_down_for, withdraw_down_for, down_for_nearby). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { newIdempotencyKey } from '@/lib/idempotency';
import { OjoroCallError, rpc } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';
import { toOjoroError, type RpcArgs } from '@ojoro/contracts';

import { retryNetwork } from '../plans/data';

export function useSports() {
  return useQuery({
    queryKey: ['sports'],
    staleTime: 24 * 3600_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sports')
        .select('id, name, sort_order')
        .order('sort_order');
      if (error) throw new OjoroCallError(toOjoroError(error));
      return data;
    },
  });
}

/** Your active Down For signals (self only). */
export function useMySignals(userId: string | null) {
  return useQuery({
    queryKey: ['home', 'signals', userId],
    enabled: userId !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('intent_signals')
        .select('id, sport_id, window_start, window_end, expires_at, status, matched_plan_id')
        .eq('user_id', userId ?? '')
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });
      if (error) throw new OjoroCallError(toOjoroError(error));
      return data;
    },
  });
}

type CreateArgs = Omit<RpcArgs<'create_down_for'>, 'p_idempotency_key'>;

/**
 * create_down_for with one key per intention. Idempotent twice over on the server (the key, and an
 * active signal for the same sport and window), so a retry never makes a second signal.
 */
export function useCreateDownFor() {
  const qc = useQueryClient();
  const mutation = useMutation({
    retry: retryNetwork,
    mutationFn: (v: { args: CreateArgs; key: string }) =>
      rpc('create_down_for', { ...v.args, p_idempotency_key: v.key }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['home'] }),
  });
  const tap = (args: CreateArgs, options?: Parameters<typeof mutation.mutate>[1]) => {
    if (mutation.isPending) return;
    mutation.mutate({ args, key: newIdempotencyKey() }, options);
  };
  return { ...mutation, tap };
}

export function useWithdrawDownFor() {
  const qc = useQueryClient();
  return useMutation({
    retry: retryNetwork,
    mutationFn: (signalId: string) => rpc('withdraw_down_for', { p_signal_id: signalId }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['home'] }),
  });
}
