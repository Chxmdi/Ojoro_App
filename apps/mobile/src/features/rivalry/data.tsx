/**
 * Reads and writes for a Rivalry (docs/COMPETITION_CONTRACT.md, Rivalries and rematch). Every key
 * starts with ['rivalry', id]. The record is computed by the server from insert-only results, so a
 * rematch only ever adds a new linked Call-Out (and, once accepted, a new Challenge Event); nothing
 * here rewrites a past meeting.
 *
 * RUN IT BACK and accept carry an idempotency key per intention; NOT YET (decline) is idempotent on
 * the server for the same person. All three are safely retried.
 */
import type { RealtimeSubscription } from '@ojoro/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { track } from '@/lib/analytics';
import { useRealtimeRefetch } from '@/lib/realtime';
import { rpc } from '@/lib/rpc';

import { useIntentKey } from '../activities/data';
import { retryNetwork } from '../events/data';
import type { RivalryMeetingRow, RivalryViewRow } from './logic';

export const rivalryKeys = {
  all: (id: string) => ['rivalry', id] as const,
  view: (id: string) => ['rivalry', id, 'view'] as const,
  meetings: (id: string) => ['rivalry', id, 'meetings'] as const,
};

/** RECENT MEETINGS shown on the screen. */
export const MEETINGS_LIMIT = 20;

/** `rivalry_view`: null when the rivalry isn't found (the RPC raises rivalry_not_found instead). */
export function useRivalry(id: string) {
  return useQuery({
    queryKey: rivalryKeys.view(id),
    queryFn: async () => {
      const row = (await rpc('rivalry_view', { p_rivalry_id: id }))[0];
      return row ? (row as unknown as RivalryViewRow) : null;
    },
    enabled: !!id,
    retry: retryNetwork,
  });
}

/** RECENT MEETINGS, newest first (verified results only). */
export function useRivalryMeetings(id: string, enabled = true) {
  return useQuery({
    queryKey: rivalryKeys.meetings(id),
    queryFn: async () =>
      (await rpc('rivalry_meetings', { p_rivalry_id: id, p_limit: MEETINGS_LIMIT })) as unknown as RivalryMeetingRow[],
    enabled: !!id && enabled,
    retry: retryNetwork,
  });
}

/**
 * The contract has no rivalry channel, so this listens to the two tables a rivalry's screen
 * depends on, filtered by `rivalry_id` (both are in the realtime publication; RLS applies): a
 * rematch call-out sent, answered or withdrawn, and an event scheduled, going live or completing
 * (a new result). Realtime is a hint: each change refetches.
 */
export function rivalrySubscription(id: string): RealtimeSubscription {
  const filter = `rivalry_id=eq.${id}`;
  return {
    channel: `rivalry:${id}`,
    changes: [
      { event: '*', schema: 'public', table: 'call_outs', filter },
      { event: '*', schema: 'public', table: 'challenge_events', filter },
    ],
  };
}

export function useRivalryRealtime(id: string) {
  useRealtimeRefetch(id ? rivalrySubscription(id) : null, [rivalryKeys.all(id)]);
}

/** RUN IT BACK with nothing pending: ask for a rematch of the last meeting (or accept theirs). */
export function useRunItBack(id: string) {
  const qc = useQueryClient();
  const intent = useIntentKey();
  return useMutation({
    mutationFn: (eventId: string) =>
      rpc('run_it_back_challenge', { p_event_id: eventId, p_idempotency_key: intent.key() }),
    retry: retryNetwork,
    onMutate: (eventId) => track('run_it_back_tapped', { rivalry_id: id, event_id: eventId, from: 'rivalry' }),
    onSettled: (_d, error) => {
      intent.settle(error);
      return qc.invalidateQueries({ queryKey: rivalryKeys.all(id) });
    },
  });
}

/** RUN IT BACK on their request: accept the rematch call-out. Creates exactly one new event. */
export function useAcceptRematch(id: string) {
  const qc = useQueryClient();
  const intent = useIntentKey();
  return useMutation({
    mutationFn: (callOutId: string) =>
      rpc('accept_call_out', { p_call_out_id: callOutId, p_idempotency_key: intent.key() }),
    retry: retryNetwork,
    onMutate: (callOutId) =>
      track('run_it_back_tapped', { rivalry_id: id, call_out_id: callOutId, from: 'rivalry', answer: 'accept' }),
    onSettled: (_d, error) => {
      intent.settle(error);
      return qc.invalidateQueries({ queryKey: rivalryKeys.all(id) });
    },
  });
}

/** NOT YET: decline their rematch call-out. The same person declining twice changes nothing. */
export function useDeclineRematch(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (callOutId: string) => rpc('decline_call_out', { p_call_out_id: callOutId }),
    retry: retryNetwork,
    onMutate: (callOutId) => track('cta_tapped', { cta: 'rematch_not_yet', rivalry_id: id, call_out_id: callOutId }),
    onSettled: () => qc.invalidateQueries({ queryKey: rivalryKeys.all(id) }),
  });
}
