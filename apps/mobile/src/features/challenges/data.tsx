/**
 * Reads and writes for Compete and the Call-Out (docs/COMPETITION_CONTRACT.md, Call-Outs). Every
 * key starts with ['challenges']; the call-out channels refetch them as a hint, never as the truth.
 *
 * ACCEPT, COUNTER and CALL OUT carry one idempotency key per intention, made on the first tap and
 * reused on every retry: a double tap or a retry after a dropped connection makes exactly one
 * Challenge Event, one counter, one call-out (the server also locks the call-out row). PASS and TAKE
 * IT BACK are set-to-state on the server, so a retry is safe without a key.
 *
 * Analytics: the server records callout_sent / accepted / countered / declined; the client sends
 * the taps only (contract, Analytics), once per intention, never per retry.
 */
import {
  callOutsSubscription,
  callOutSubscription,
  isRetryable,
  type RpcArgs,
} from '@ojoro/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { haptics } from '@/design-system';
import { track } from '@/lib/analytics';
import { newIdempotencyKey } from '@/lib/idempotency';
import { useRealtimeRefetch } from '@/lib/realtime';
import { ojoroErrorOf, rpc } from '@/lib/rpc';

import type { CallOutFacts, CallOutRowFacts, EventRowFacts, RivalryRowFacts } from './logic';

export const challengeKeys = {
  all: ['challenges'] as const,
  callOut: (id: string) => ['challenges', 'call-out', id] as const,
  callOuts: ['challenges', 'call-outs'] as const,
  events: ['challenges', 'events'] as const,
  rivalries: ['challenges', 'rivalries'] as const,
};

function retryNetwork(failures: number, error: unknown): boolean {
  return failures < 2 && isRetryable(ojoroErrorOf(error));
}

/** call_out_view: the CallOut screen. Null when it isn't there (or isn't yours to see). */
export function useCallOut(id: string) {
  return useQuery({
    queryKey: challengeKeys.callOut(id),
    queryFn: async () => ((await rpc('call_out_view', { p_call_out_id: id }))[0] ?? null) as unknown as CallOutFacts | null,
    retry: retryNetwork,
    enabled: id.length > 0,
  });
}

/** Call-outs to you (and crews you speak for) and from you: pending first, newest first. */
export function useMyCallOuts() {
  return useQuery({
    queryKey: challengeKeys.callOuts,
    queryFn: async () => (await rpc('my_call_outs', { p_box: 'all', p_limit: 30 })) as unknown as CallOutRowFacts[],
    retry: retryNetwork,
  });
}

/** Events you compete in, organize, your crew is in, or you follow: live first. */
export function useMyChallengeEvents() {
  return useQuery({
    queryKey: challengeKeys.events,
    queryFn: async () => (await rpc('my_challenge_events', { p_limit: 20 })) as unknown as EventRowFacts[],
    retry: retryNetwork,
  });
}

export function useMyRivalries() {
  return useQuery({
    queryKey: challengeKeys.rivalries,
    queryFn: async () => (await rpc('my_rivalries', { p_limit: 10 })) as unknown as RivalryRowFacts[],
    retry: retryNetwork,
  });
}

/** Compete: any call-out to or from you refetches the lists (events follow from an accept). */
export function useCompeteRealtime(userId: string | null) {
  useRealtimeRefetch(userId ? callOutsSubscription(userId) : null, [challengeKeys.all]);
}

/** CallOut: the call-out's status (accepted, countered, passed, taken back). */
export function useCallOutRealtime(id: string) {
  useRealtimeRefetch(id ? callOutSubscription(id) : null, [challengeKeys.callOut(id), challengeKeys.callOuts]);
}

/**
 * One key per intention. `settle` clears it once the server has answered with a coded error (a new
 * tap is a new intention); network failures keep it, so the retry is the same intention.
 */
function useIntention() {
  const ref = useRef<string | null>(null);
  return {
    key(): string {
      ref.current ??= newIdempotencyKey();
      return ref.current;
    },
    settle(error: unknown) {
      if (error && !isRetryable(ojoroErrorOf(error))) ref.current = null;
    },
    /** A finished intention: the next tap starts a new one. */
    done() {
      ref.current = null;
    },
  };
}

/**
 * ACCEPT: the server creates the Challenge Event in the same transaction, exactly once. The key
 * lives as long as the screen: tapping again (or a retry) replays the same accept and returns the
 * same event, so nothing extra is ever created.
 */
export function useAcceptCallOut(id: string) {
  const qc = useQueryClient();
  const intent = useIntention();
  const m = useMutation({
    mutationFn: (key: string) => rpc('accept_call_out', { p_call_out_id: id, p_idempotency_key: key }),
    retry: retryNetwork,
    onSuccess: () => {
      void haptics.challengeAccepted();
    },
    onError: (e) => intent.settle(e),
    onSettled: () => qc.invalidateQueries({ queryKey: challengeKeys.all }),
  });
  return {
    ...m,
    /** A second tap while the first is in flight does nothing. */
    accept(options?: { onSuccess?: (eventId: string | null) => void }) {
      if (m.isPending) return;
      track('cta_tapped', { cta: 'call_out_accept', call_out_id: id });
      m.mutate(intent.key(), { onSuccess: (s) => options?.onSuccess?.(s.event_id ?? null) });
    },
  };
}

type CounterArgs = Omit<RpcArgs<'counter_call_out'>, 'p_idempotency_key' | 'p_call_out_id'>;

/** COUNTER: a new call-out back with the changes; the original becomes COUNTERED. */
export function useCounterCallOut(id: string) {
  const qc = useQueryClient();
  const intent = useIntention();
  const m = useMutation({
    mutationFn: (v: { key: string; args: CounterArgs }) =>
      rpc('counter_call_out', { p_call_out_id: id, p_idempotency_key: v.key, ...v.args }),
    retry: retryNetwork,
    onSuccess: () => intent.done(),
    onError: (e) => intent.settle(e),
    onSettled: () => qc.invalidateQueries({ queryKey: challengeKeys.all }),
  });
  return {
    ...m,
    counter(args: CounterArgs, options?: { onSuccess?: (counterId: string | null) => void }) {
      if (m.isPending) return;
      track('cta_tapped', { cta: 'call_out_counter', call_out_id: id });
      m.mutate({ key: intent.key(), args }, { onSuccess: (s) => options?.onSuccess?.(s.call_out_id ?? null) });
    },
  };
}

/** PASS: declines quietly. Idempotent on the server. */
export function useDeclineCallOut(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => rpc('decline_call_out', { p_call_out_id: id }),
    retry: retryNetwork,
    onMutate: () => track('cta_tapped', { cta: 'call_out_pass', call_out_id: id }),
    onSettled: () => qc.invalidateQueries({ queryKey: challengeKeys.all }),
  });
}

/** TAKE IT BACK: the challenger withdraws a pending call-out. Idempotent on the server. */
export function useWithdrawCallOut(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => rpc('withdraw_call_out', { p_call_out_id: id }),
    retry: retryNetwork,
    onMutate: () => track('cta_tapped', { cta: 'call_out_withdraw', call_out_id: id }),
    onSettled: () => qc.invalidateQueries({ queryKey: challengeKeys.all }),
  });
}

type CreateArgs = Omit<RpcArgs<'create_call_out'>, 'p_idempotency_key'>;

/** CALL OUT: one call-out per tap, however many times the request is retried. */
export function useCreateCallOut() {
  const qc = useQueryClient();
  const intent = useIntention();
  const m = useMutation({
    mutationFn: (v: { key: string; args: CreateArgs }) => rpc('create_call_out', { p_idempotency_key: v.key, ...v.args }),
    retry: retryNetwork,
    onSuccess: () => intent.done(),
    onError: (e) => intent.settle(e),
    onSettled: () => qc.invalidateQueries({ queryKey: challengeKeys.all }),
  });
  return {
    ...m,
    send(args: CreateArgs, options?: { onSuccess?: (callOutId: string | null) => void }) {
      if (m.isPending) return;
      track('cta_tapped', { cta: 'call_out_send', to: args.p_challenger_crew_id ? 'crew' : args.p_opponent_id ? 'person' : 'open' });
      m.mutate({ key: intent.key(), args }, { onSuccess: (s) => options?.onSuccess?.(s.call_out_id ?? null) });
    },
  };
}
