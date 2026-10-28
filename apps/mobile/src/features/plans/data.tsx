/**
 * Reads and writes for the Plan, Pull Someone In and GAME ON screens (docs/SLICE01_CONTRACT.md,
 * Screens). Reads use RLS-filtered views and read RPCs; writes go through RPCs with idempotency
 * keys. Realtime only invalidates; the queries are the source of truth.
 */
import { isRetryable, planSubscription, type Database, type RpcReturns } from '@ojoro/contracts';
import {
  onlineManager,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { newIdempotencyKey } from '@/lib/idempotency';
import { useRealtimeRefetch } from '@/lib/realtime';
import { OjoroCallError, ojoroErrorOf, rpc } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';
import { toOjoroError } from '@ojoro/contracts';

import { DEFAULT_TIME_ZONE } from './time';

export type PlanCard = Database['public']['Views']['plan_cards']['Row'];
export type ActivityCard = Database['public']['Views']['activity_cards']['Row'];
export type PlanState = RpcReturns<'im_down'>;

/** Query keys. Everything under ['plan', id] refetches on that plan's realtime changes. */
export const planKeys = {
  all: (id: string) => ['plan', id] as const,
  card: (id: string) => ['plan', id, 'card'] as const,
  roster: (id: string) => ['plan', id, 'roster'] as const,
  poll: (id: string) => ['plan', id, 'poll'] as const,
  meeting: (id: string) => ['plan', id, 'meeting'] as const,
  activity: (id: string) => ['plan', id, 'activity'] as const,
  stillOn: (id: string) => ['plan', id, 'still-on'] as const,
  quota: (id: string) => ['plan', id, 'quota'] as const,
  candidates: (id: string) => ['plan', id, 'candidates'] as const,
  placeTonight: (id: string) => ['plan', id, 'place-tonight'] as const,
};

/** Throws the OjoroCallError behind a PostgREST read error. */
export function check<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new OjoroCallError(toOjoroError(result.error));
  return result.data;
}

/** A list read: throws on error, never null. */
export function checkRows<T>(result: { data: T[] | null; error: unknown }): T[] {
  return check(result) ?? [];
}

/** Retry only network failures (an `ojoro` error is an answer), at most twice. */
export function retryNetwork(failures: number, error: unknown): boolean {
  return failures < 2 && isRetryable(ojoroErrorOf(error));
}

/* ---------- Connectivity and time ---------- */

/** Online as TanStack Query sees it (NetInfo drives it). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
    () => true,
  );
}

/**
 * The current time, re-rendering when any of `moments` (ISO instants) passes, so deadlines turn a
 * plan EXPIRED on screen without waiting for the server job (contract, Realtime rules).
 */
export function useNow(moments: readonly (string | null | undefined)[]): Date {
  const [now, setNow] = useState(() => new Date());
  const key = moments.join('|');
  useEffect(() => {
    const t = Date.now();
    const next = key
      .split('|')
      .map((m) => (m ? Date.parse(m) : NaN))
      .filter((m) => Number.isFinite(m) && m > t)
      .sort((a, b) => a - b)[0];
    // Also tick every minute so "JUST NOW" and closing times stay true.
    const wait = Math.min(next === undefined ? 60_000 : next - t + 50, 60_000);
    const id = setTimeout(() => setNow(new Date()), wait);
    return () => clearTimeout(id);
  }, [key, now]);
  return now;
}

/* ---------- Reads ---------- */

export function usePlanCard(id: string) {
  return useQuery({
    queryKey: planKeys.card(id),
    queryFn: async () =>
      check(await supabase.from('plan_cards').select('*').eq('id', id).maybeSingle()),
  });
}

export function usePlanRoster(id: string) {
  return useQuery({
    queryKey: planKeys.roster(id),
    queryFn: () => rpc('plan_roster', { p_plan_id: id }),
  });
}

export function usePlanPoll(id: string, userId: string | null) {
  return useQuery({
    queryKey: planKeys.poll(id),
    queryFn: async () => {
      const options = checkRows(
        await supabase.from('plan_time_options').select('id, starts_at, vote_count').eq('plan_id', id),
      );
      let mine: string | null = null;
      if (userId && options.length > 0) {
        const votes = check(
          await supabase
            .from('plan_time_votes')
            .select('option_id')
            .eq('plan_id', id)
            .eq('user_id', userId)
            .maybeSingle(),
        );
        mine = votes?.option_id ?? null;
      }
      return { options, mine };
    },
  });
}

/** The exact meeting point: members and the host only (RLS returns nothing to anyone else). */
export function useMeetingPoint(id: string, enabled: boolean) {
  return useQuery({
    queryKey: planKeys.meeting(id),
    enabled,
    queryFn: async () =>
      check(await supabase.from('plan_meeting_points').select('label, lat, lng').eq('plan_id', id).maybeSingle()),
  });
}

export function useActivityCard(planId: string, activityId: string | null) {
  return useQuery({
    queryKey: planKeys.activity(planId),
    enabled: activityId !== null,
    queryFn: async () =>
      check(await supabase.from('activity_cards').select('*').eq('id', activityId ?? '').maybeSingle()),
  });
}

export function useStillOn(id: string, enabled: boolean) {
  return useQuery({
    queryKey: planKeys.stillOn(id),
    enabled,
    queryFn: () => rpc('still_on_nearby', { p_plan_id: id }),
  });
}

/** Visible plans at the same place on the same evening ("4 TONIGHT" on the place card). */
export function usePlaceTonight(planId: string, placeId: string | null, startsAt: string | null) {
  return useQuery({
    queryKey: planKeys.placeTonight(planId),
    enabled: placeId !== null && startsAt !== null,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const start = Date.parse(startsAt ?? '');
      const { count, error } = await supabase
        .from('plan_cards')
        .select('id', { count: 'exact', head: true })
        .eq('place_id', placeId ?? '')
        .in('status', ['forming', 'game_on'])
        .gte('starts_at', new Date(start - 6 * 3600_000).toISOString())
        .lt('starts_at', new Date(start + 6 * 3600_000).toISOString());
      if (error) throw new OjoroCallError(toOjoroError(error));
      return count ?? 0;
    },
  });
}

/** Place time zones (a small catalog): times show in the place's zone. */
export function usePlaceZones() {
  return useQuery({
    queryKey: ['places', 'zones'],
    staleTime: 24 * 3600_000,
    queryFn: async () => {
      const rows = checkRows(await supabase.from('places').select('id, time_zone'));
      return Object.fromEntries(rows.map((r) => [r.id, r.time_zone])) as Record<string, string>;
    },
  });
}

export function useTimeZone(placeId: string | null | undefined): string {
  const zones = usePlaceZones();
  return (placeId && zones.data?.[placeId]) || DEFAULT_TIME_ZONE;
}

/** Your coarse area (self only), for distances. */
export function useMyArea(userId: string | null) {
  return useQuery({
    queryKey: ['me', 'private', userId],
    enabled: userId !== null,
    staleTime: 10 * 60_000,
    queryFn: async () =>
      check(
        await supabase
          .from('profile_private')
          .select('area_lat, area_lng, discovery_radius_km')
          .eq('user_id', userId ?? '')
          .maybeSingle(),
      ),
  });
}

export function usePullInQuota(id: string, enabled: boolean) {
  return useQuery({
    queryKey: planKeys.quota(id),
    enabled,
    queryFn: async () => (await rpc('pull_in_quota', { p_plan_id: id }))[0] ?? null,
  });
}

export function usePullInCandidates(id: string, enabled: boolean) {
  return useQuery({
    queryKey: planKeys.candidates(id),
    enabled,
    queryFn: () => rpc('pull_in_candidates', { p_plan_id: id }),
  });
}

/** Realtime for a plan screen: count, status (GAME ON), new members, poll counts. */
export function usePlanRealtime(id: string) {
  useRealtimeRefetch(planSubscription(id), [planKeys.all(id)]);
}

/* ---------- Writes ---------- */

function applyPlanState(qc: QueryClient, id: string, state: PlanState, joined: boolean) {
  qc.setQueryData<PlanCard | null>(planKeys.card(id), (prev) =>
    prev
      ? {
          ...prev,
          member_count: state.member_count ?? prev.member_count,
          status: state.status ?? prev.status,
          effective_status: state.status ?? prev.effective_status,
          activity_id: state.activity_id ?? prev.activity_id,
          starts_at: state.starts_at ?? prev.starts_at,
          i_am_in: state.is_member ?? joined,
        }
      : prev,
  );
}

/**
 * A membership change with one idempotency key per tap: retries (network only) reuse it, so the
 * server applies it once. Optimistic: the count and YOU'RE DOWN move at once and roll back on an
 * error. While offline the mutation pauses and resumes on reconnect (`isPaused`).
 */
function useMembership(id: string, kind: 'im_down' | 'leave_plan') {
  const qc = useQueryClient();
  const joining = kind === 'im_down';
  return useMutation({
    mutationKey: ['plan', id, kind],
    retry: retryNetwork,
    mutationFn: (key: string) => rpc(kind, { p_plan_id: id, p_idempotency_key: key }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: planKeys.card(id) });
      const previous = qc.getQueryData<PlanCard | null>(planKeys.card(id));
      if (previous && Boolean(previous.i_am_in) !== joining) {
        const optimistic: PlanCard = {
          ...previous,
          i_am_in: joining,
          member_count: Math.max(0, previous.member_count + (joining ? 1 : -1)),
        };
        qc.setQueryData<PlanCard | null>(planKeys.card(id), optimistic);
      }
      return { previous };
    },
    onError: (_error, _key, context) => {
      if (context?.previous !== undefined) qc.setQueryData(planKeys.card(id), context.previous);
    },
    onSuccess: (state) => applyPlanState(qc, id, state, joining),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: planKeys.all(id) });
      void qc.invalidateQueries({ queryKey: ['home'] });
    },
  });
}

/**
 * I'M DOWN. `tap()` makes the key for this intention; a second tap while the first is in flight
 * does nothing (the server would also answer `changed: false`).
 */
export function useImDown(id: string) {
  const mutation = useMembership(id, 'im_down');
  const busy = useRef(false);
  const tap = (options?: Parameters<typeof mutation.mutate>[1]) => {
    if (busy.current || mutation.isPending) return;
    busy.current = true;
    mutation.mutate(newIdempotencyKey(), {
      ...options,
      onSettled: (...args) => {
        busy.current = false;
        options?.onSettled?.(...args);
      },
    });
  };
  return { ...mutation, tap };
}

export function useLeavePlan(id: string) {
  const mutation = useMembership(id, 'leave_plan');
  const tap = (options?: Parameters<typeof mutation.mutate>[1]) => {
    if (mutation.isPending) return;
    mutation.mutate(newIdempotencyKey(), options);
  };
  return { ...mutation, tap };
}

export function useVoteTime(id: string) {
  const qc = useQueryClient();
  return useMutation({
    retry: retryNetwork,
    mutationFn: (optionId: string) => rpc('vote_time', { p_plan_id: id, p_option_id: optionId }),
    onMutate: async (optionId) => {
      await qc.cancelQueries({ queryKey: planKeys.poll(id) });
      type Poll = { options: { id: string; starts_at: string; vote_count: number }[]; mine: string | null };
      const previous = qc.getQueryData<Poll>(planKeys.poll(id));
      if (previous) {
        qc.setQueryData<Poll>(planKeys.poll(id), {
          mine: optionId,
          options: previous.options.map((o) => ({
            ...o,
            vote_count:
              o.vote_count + (o.id === optionId ? 1 : 0) - (o.id === previous.mine && previous.mine !== optionId ? 1 : 0),
          })),
        });
      }
      return { previous };
    },
    onError: (_e, _v, context) => {
      if (context?.previous) qc.setQueryData(planKeys.poll(id), context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: planKeys.poll(id) }),
  });
}

export function useProposeTime(id: string) {
  const qc = useQueryClient();
  return useMutation({
    retry: retryNetwork,
    mutationFn: (startsAt: string) => rpc('propose_time', { p_plan_id: id, p_starts_at: startsAt }),
    onSettled: () => qc.invalidateQueries({ queryKey: planKeys.poll(id) }),
  });
}

export function useJoinWaitlist(planId: string) {
  const qc = useQueryClient();
  const mutation = useMutation({
    retry: retryNetwork,
    mutationFn: (v: { activityId: string; key: string }) =>
      rpc('join_waitlist', { p_activity_id: v.activityId, p_idempotency_key: v.key }),
    onSettled: () => qc.invalidateQueries({ queryKey: planKeys.all(planId) }),
  });
  const tap = (activityId: string, options?: Parameters<typeof mutation.mutate>[1]) => {
    if (mutation.isPending) return;
    mutation.mutate({ activityId, key: newIdempotencyKey() }, options);
  };
  return { ...mutation, tap };
}

export function usePullIn(id: string) {
  const qc = useQueryClient();
  const mutation = useMutation({
    retry: retryNetwork,
    mutationFn: (v: { invitees: string[]; key: string }) =>
      rpc('pull_in', { p_plan_id: id, p_invitee_ids: v.invitees, p_idempotency_key: v.key }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: planKeys.quota(id) });
      void qc.invalidateQueries({ queryKey: planKeys.candidates(id) });
    },
  });
  const tap = (invitees: string[], options?: Parameters<typeof mutation.mutate>[1]) => {
    if (mutation.isPending || invitees.length === 0) return;
    mutation.mutate({ invitees, key: newIdempotencyKey() }, options);
  };
  return { ...mutation, tap };
}
