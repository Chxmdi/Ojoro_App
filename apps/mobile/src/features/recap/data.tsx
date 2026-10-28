/** Recap reads (recaps, recap_people, recap_for_me) and the Run It Back write. */
import { toOjoroError } from '@ojoro/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';

import { track } from '@/lib/analytics';
import { OjoroCallError, ojoroErrorOf, rpc } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

import { activityKeys, retryNetwork } from '../activities/data';
import type { PassportRow, RecapPerson, RecapRow } from './logic';

export function useRecap(activityId: string) {
  return useQuery({
    queryKey: [...activityKeys.all(activityId), 'recap'],
    queryFn: async () => {
      const { data, error } = await supabase.from('recaps').select('*').eq('activity_id', activityId).maybeSingle();
      if (error) throw new OjoroCallError(toOjoroError(error));
      return data as (RecapRow & { id: string }) | null;
    },
    retry: retryNetwork,
  });
}

/** People who played; empty for people who didn't (the RPC answers `not_player`). */
export function useRecapPeople(activityId: string, enabled = true) {
  return useQuery({
    queryKey: [...activityKeys.all(activityId), 'recap-people'],
    queryFn: async () => {
      try {
        return (await rpc('recap_people', { p_activity_id: activityId })) as unknown as (RecapPerson & {
          team: 'a' | 'b' | null;
        })[];
      } catch (error) {
        if (ojoroErrorOf(error).code === 'not_player') return [];
        throw error;
      }
    },
    enabled,
    retry: retryNetwork,
  });
}

/** Your Passport stamp for this game; empty until the recap exists, or if you didn't play. */
export function useRecapForMe(activityId: string, enabled = true) {
  return useQuery({
    queryKey: [...activityKeys.all(activityId), 'recap-me'],
    queryFn: async () =>
      ((await rpc('recap_for_me', { p_activity_id: activityId })) as unknown as PassportRow[])[0] ?? null,
    enabled,
    retry: retryNetwork,
  });
}

export function useRunItBack(activityId: string) {
  return useMutation({
    mutationKey: ['activity', activityId, 'run-it-back'],
    mutationFn: (v: { key: string; startsAt: string }) =>
      rpc('run_it_back', { p_activity_id: activityId, p_starts_at: v.startsAt, p_idempotency_key: v.key }),
    retry: retryNetwork,
    onSuccess: (state) => {
      // The server records run_it_back; this is the client's view of the outcome.
      track('cta_tapped', {
        cta: 'run_it_back_opened',
        activity_id: activityId,
        created: !!state.created,
        invites_sent: state.invites_sent ?? 0,
        chain_length: state.chain_length ?? 1,
      });
    },
  });
}
