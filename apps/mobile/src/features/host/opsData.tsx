/**
 * Reads and writes for HostSeason and HostInsights (docs/HOSTS_OPS_CONTRACT.md). Every key starts
 * with `hostKeys.all(programId)`, so the program's realtime hint (route layout) refreshes them too;
 * the league has its own hint (`hostLeagueSubscription`) for captains' scores and fixtures.
 *
 * CONFIRM RESULT and ASK … TO REF carry one idempotency key per intention (reused on retry); DISPUTE
 * is set-to-state on the server. A confirmed result is final: standings recompute from it on the
 * next read, nothing here rewrites one.
 */
import {
  hostLeagueSubscription,
  HOST_INSIGHTS_DAYS,
  type HostFixtureResultState,
  type HostInsights,
  type HostLeagueView,
} from '@ojoro/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { track } from '@/lib/analytics';
import { useRealtimeRefetch } from '@/lib/realtime';
import { rpc } from '@/lib/rpc';

import { useIntentKey } from '../activities/data';
import { hostKeys, retryNetwork } from './data';

export const opsKeys = {
  league: (programId: string, leagueId: string) => [...hostKeys.all(programId), 'league', leagueId] as const,
  insights: (programId: string) => [...hostKeys.all(programId), 'insights', HOST_INSIGHTS_DAYS] as const,
};

/** `host_league_view`: league, results to confirm (hosts), standings and the next round. */
export function useLeague(programId: string, leagueId: string) {
  return useQuery({
    queryKey: opsKeys.league(programId, leagueId),
    queryFn: async () =>
      (await rpc('host_league_view', { p_league_id: leagueId })) as unknown as HostLeagueView | null,
    retry: retryNetwork,
    enabled: !!leagueId,
  });
}

/** Captains' scores, fixtures and confirmed results: refetch hints for the league. */
export function useLeagueRealtime(programId: string, leagueId: string) {
  useRealtimeRefetch(leagueId ? hostLeagueSubscription(leagueId) : null, [opsKeys.league(programId, leagueId)]);
}

/** Refresh the league and HostHome's NEEDS YOU / week rows after a write. */
function useInvalidateLeague(programId: string, leagueId: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: opsKeys.league(programId, leagueId) }),
      qc.invalidateQueries({ queryKey: hostKeys.needsYou(programId) }),
      qc.invalidateQueries({ queryKey: hostKeys.week(programId) }),
    ]);
}

/** CONFIRM RESULT with the captains' agreed score. Inserts the one result; safe to retry. */
export function useConfirmResult(programId: string, leagueId: string) {
  const intent = useIntentKey();
  const invalidate = useInvalidateLeague(programId, leagueId);
  return useMutation({
    mutationFn: async (fixtureId: string) =>
      (await rpc('confirm_league_result', {
        p_fixture_id: fixtureId,
        p_idempotency_key: intent.key(),
      })) as unknown as HostFixtureResultState,
    retry: retryNetwork,
    onMutate: (fixtureId) =>
      track('cta_tapped', { cta: 'league_confirm_result', league_id: leagueId, fixture_id: fixtureId }),
    onSettled: (_d, error) => {
      intent.settle(error);
      return invalidate();
    },
  });
}

/** DISPUTE: clears both captains' scores and asks them to send it again. Set-to-state. */
export function useDisputeResult(programId: string, leagueId: string) {
  const invalidate = useInvalidateLeague(programId, leagueId);
  return useMutation({
    mutationFn: (fixtureId: string) => rpc('dispute_league_result', { p_fixture_id: fixtureId }),
    retry: retryNetwork,
    onMutate: (fixtureId) =>
      track('cta_tapped', { cta: 'league_dispute_result', league_id: leagueId, fixture_id: fixtureId }),
    onSettled: () => invalidate(),
  });
}

/** ASK … TO REF: the suggested free referee is asked; they answer from their notification. */
export function useAskReferee(programId: string, leagueId: string) {
  const intent = useIntentKey();
  const invalidate = useInvalidateLeague(programId, leagueId);
  return useMutation({
    mutationFn: (v: { fixtureId: string; userId: string }) =>
      rpc('ask_league_referee', {
        p_fixture_id: v.fixtureId,
        p_user_id: v.userId,
        p_idempotency_key: intent.key(),
      }),
    retry: retryNetwork,
    onMutate: (v) => track('cta_tapped', { cta: 'league_ask_referee', league_id: leagueId, fixture_id: v.fixtureId }),
    onSettled: (_d, error) => {
      intent.settle(error);
      return invalidate();
    },
  });
}

/** `host_insights` over the last 30 days (hosts only). */
export function useInsights(programId: string) {
  return useQuery({
    queryKey: opsKeys.insights(programId),
    queryFn: async () =>
      (await rpc('host_insights', { p_program_id: programId, p_days: HOST_INSIGHTS_DAYS })) as unknown as HostInsights | null,
    retry: retryNetwork,
    enabled: !!programId,
  });
}

/** DOWNLOAD CSV: fetched on demand, never cached (it's the ledger as of now). */
export function useInsightsCsv(programId: string) {
  return useMutation({
    mutationFn: () => rpc('host_insights_csv', { p_program_id: programId, p_days: HOST_INSIGHTS_DAYS }),
    retry: retryNetwork,
    onMutate: () => track('cta_tapped', { cta: 'host_insights_csv', program_id: programId }),
  });
}
