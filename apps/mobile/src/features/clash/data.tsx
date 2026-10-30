/**
 * Reads and writes for Ojoro Clash (docs/COMMUNITIES_CONTRACT.md, Ojoro Clash). Keys start with
 * ['clash', id]; one realtime hint on `clash:{id}` refetches the score, crowd, events and your part.
 */
import { clashSubscription, type ClashEvent, type ClashMyPart, type ClashView } from '@ojoro/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { track } from '@/lib/analytics';
import { useRealtimeRefetch } from '@/lib/realtime';
import { rpc } from '@/lib/rpc';

import { retryNetwork } from '../crews/data';

export const clashKeys = {
  all: (id: string) => ['clash', id] as const,
  view: (id: string) => ['clash', id, 'view'] as const,
  events: (id: string) => ['clash', id, 'events'] as const,
  myPart: (id: string) => ['clash', id, 'my-part'] as const,
};

export function useClashView(id: string) {
  return useQuery({
    queryKey: clashKeys.view(id),
    queryFn: async () => ((await rpc('clash_view', { p_clash_id: id }))[0] ?? null) as ClashView | null,
    retry: retryNetwork,
  });
}

export function useClashEvents(id: string, enabled: boolean) {
  return useQuery({
    queryKey: clashKeys.events(id),
    queryFn: async () => (await rpc('clash_events_list', { p_clash_id: id })) as unknown as ClashEvent[],
    retry: retryNetwork,
    enabled,
  });
}

export function useClashMyPart(id: string, enabled: boolean) {
  return useQuery({
    queryKey: clashKeys.myPart(id),
    queryFn: async () => ((await rpc('clash_my_part', { p_clash_id: id }))[0] ?? null) as ClashMyPart | null,
    retry: retryNetwork,
    enabled,
  });
}

export function useClashRealtime(id: string) {
  useRealtimeRefetch(id ? clashSubscription(id) : null, [clashKeys.all(id)]);
}

/** I'M DOWN / leave a squad: set-to-state on the server, safe to retry. Optimistic on YOUR PART. */
export function useSquad(clashId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { eventId: string; join: boolean }) =>
      v.join
        ? rpc('join_clash_squad', { p_clash_event_id: v.eventId })
        : rpc('leave_clash_squad', { p_clash_event_id: v.eventId }),
    retry: retryNetwork,
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: clashKeys.myPart(clashId) });
      const previous = qc.getQueryData<ClashMyPart | null>(clashKeys.myPart(clashId));
      if (previous && previous.clash_event_id === v.eventId && previous.i_am_in !== v.join) {
        const optimistic: ClashMyPart = {
          ...previous,
          i_am_in: v.join,
          squad_taken: Math.max(0, previous.squad_taken + (v.join ? 1 : -1)),
        };
        qc.setQueryData<ClashMyPart | null>(clashKeys.myPart(clashId), optimistic);
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous !== undefined) qc.setQueryData(clashKeys.myPart(clashId), ctx.previous);
    },
    onSuccess: (_s, v) => track('cta_tapped', { cta: v.join ? 'clash_squad_join' : 'clash_squad_leave', clash_id: clashId }),
    onSettled: () => void qc.invalidateQueries({ queryKey: clashKeys.all(clashId) }),
  });
}

/** BACK X / BACKING: set-to-state (null stops backing). Counts only; never a stake. */
export function useBackClash(clashId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (side: 'a' | 'b' | null) =>
      rpc('back_clash', { p_clash_id: clashId, ...(side ? { p_side: side } : null) }),
    retry: retryNetwork,
    onMutate: async (side) => {
      await qc.cancelQueries({ queryKey: clashKeys.view(clashId) });
      const previous = qc.getQueryData<ClashView | null>(clashKeys.view(clashId));
      if (previous) {
        const next = { ...previous, my_backing: side };
        if (previous.my_backing === 'a') next.backing_a = Math.max(0, next.backing_a - 1);
        if (previous.my_backing === 'b') next.backing_b = Math.max(0, next.backing_b - 1);
        if (side === 'a') next.backing_a += 1;
        if (side === 'b') next.backing_b += 1;
        qc.setQueryData<ClashView | null>(clashKeys.view(clashId), next);
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous !== undefined) qc.setQueryData(clashKeys.view(clashId), ctx.previous);
    },
    onSuccess: (state, side) => {
      track('crowd_backed', { clash_id: clashId, side: side ?? 'none' });
      qc.setQueryData<ClashView | null>(clashKeys.view(clashId), (v) =>
        v
          ? {
              ...v,
              my_backing: state.my_backing ?? null,
              backing_a: state.backing_a ?? v.backing_a,
              backing_b: state.backing_b ?? v.backing_b,
            }
          : v,
      );
    },
  });
}
