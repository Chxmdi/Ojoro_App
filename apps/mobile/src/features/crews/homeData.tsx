/**
 * Reads and writes for Crew Home (docs/COMMUNITIES_CONTRACT.md, Crew Home and Rituals). Keys sit
 * under ['crew', id] like the rest of the crew, so leaving the crew clears them too. Realtime on
 * `crew-home:{id}` is a hint that refetches the header, Rituals, the board and the roster.
 */
import {
  crewHomeSubscription,
  isRetryable,
  type CrewDownFor,
  type CrewFreeTonight,
  type CrewHome,
  type CrewMemory,
  type CrewRitual,
  type CrewVersus,
} from '@ojoro/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { track } from '@/lib/analytics';
import { newIdempotencyKey } from '@/lib/idempotency';
import { useRealtimeRefetch } from '@/lib/realtime';
import { ojoroErrorOf, rpc } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

import { crewKeys, retryNetwork } from './data';

export const crewHomeKeys = {
  home: (id: string) => ['crew', id, 'home'] as const,
  free: (id: string) => ['crew', id, 'free-tonight'] as const,
  downFor: (id: string) => ['crew', id, 'down-for'] as const,
  rituals: (id: string) => ['crew', id, 'rituals'] as const,
  versus: (id: string) => ['crew', id, 'versus'] as const,
  memories: (id: string) => ['crew', id, 'memories'] as const,
};

export function useCrewHome(id: string) {
  return useQuery({
    queryKey: crewHomeKeys.home(id),
    queryFn: async () => ((await rpc('crew_home', { p_crew_id: id }))[0] ?? null) as CrewHome | null,
    retry: retryNetwork,
  });
}

export function useCrewFreeTonight(id: string, enabled: boolean) {
  return useQuery({
    queryKey: crewHomeKeys.free(id),
    queryFn: async () => (await rpc('crew_free_tonight', { p_crew_id: id })) as unknown as CrewFreeTonight[],
    retry: retryNetwork,
    enabled,
  });
}

export function useCrewDownFor(id: string, enabled: boolean) {
  return useQuery({
    queryKey: crewHomeKeys.downFor(id),
    queryFn: async () => (await rpc('crew_down_for', { p_crew_id: id })) as unknown as CrewDownFor[],
    retry: retryNetwork,
    enabled,
  });
}

export function useCrewRituals(id: string, enabled: boolean) {
  return useQuery({
    queryKey: crewHomeKeys.rituals(id),
    queryFn: async () => (await rpc('crew_rituals', { p_crew_id: id })) as unknown as CrewRitual[],
    retry: retryNetwork,
    enabled,
  });
}

export function useCrewVersus(id: string, enabled: boolean) {
  return useQuery({
    queryKey: crewHomeKeys.versus(id),
    queryFn: async () => (await rpc('crew_versus', { p_crew_id: id, p_limit: 3 })) as unknown as CrewVersus[],
    retry: retryNetwork,
    enabled,
  });
}

export type MemoryView = CrewMemory & { photoUrl: string | null };

const SIGNED_URL_TTL = 60 * 60;

/** MEMORIES, with a signed URL for each photo you may see (people who played). */
export function useCrewMemories(id: string, enabled: boolean) {
  return useQuery({
    queryKey: crewHomeKeys.memories(id),
    queryFn: async (): Promise<MemoryView[]> => {
      const rows = (await rpc('crew_memories', { p_crew_id: id, p_limit: 4 })) as unknown as CrewMemory[];
      const paths = rows.map((r) => r.moment_path).filter((p): p is string => !!p);
      const urls = new Map<string, string>();
      if (paths.length > 0) {
        const { data } = await supabase.storage.from('moments').createSignedUrls(paths, SIGNED_URL_TTL);
        for (const d of data ?? []) if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
      }
      return rows.map((r) => ({ ...r, photoUrl: r.moment_path ? (urls.get(r.moment_path) ?? null) : null }));
    },
    retry: retryNetwork,
    enabled,
    staleTime: 10 * 60_000,
  });
}

export function useCrewHomeRealtime(id: string) {
  useRealtimeRefetch(id ? crewHomeSubscription(id) : null, [
    crewHomeKeys.home(id),
    crewHomeKeys.rituals(id),
    crewHomeKeys.downFor(id),
    crewHomeKeys.versus(id),
    crewKeys.view(id),
    crewKeys.roster(id),
  ]);
}

// Writes -----------------------------------------------------------------------------------------

/**
 * I'M DOWN on a crew mate's Down For: your own matching Down For. One key per tap, reused on retry
 * (network only), so it creates one signal.
 */
export function useJoinDownFor(crewId: string) {
  const qc = useQueryClient();
  const keys = useRef(new Map<string, string>());
  const mutation = useMutation({
    mutationFn: (signalId: string) => {
      let key = keys.current.get(signalId);
      if (!key) {
        key = newIdempotencyKey();
        keys.current.set(signalId, key);
      }
      return rpc('join_down_for', { p_signal_id: signalId, p_idempotency_key: key });
    },
    retry: retryNetwork,
    onMutate: async (signalId) => {
      await qc.cancelQueries({ queryKey: crewHomeKeys.downFor(crewId) });
      const previous = qc.getQueryData<CrewDownFor[]>(crewHomeKeys.downFor(crewId));
      qc.setQueryData<CrewDownFor[]>(crewHomeKeys.downFor(crewId), (rows) =>
        (rows ?? []).map((r) => (r.signal_id === signalId ? { ...r, i_am_down: true, down_count: r.down_count + 1 } : r)),
      );
      return { previous };
    },
    onError: (e, signalId, ctx) => {
      if (ctx?.previous) qc.setQueryData(crewHomeKeys.downFor(crewId), ctx.previous);
      if (!isRetryable(ojoroErrorOf(e))) keys.current.delete(signalId);
    },
    onSuccess: (_state, signalId) => {
      keys.current.delete(signalId);
      // The server records down_for_joined; the tap is a CTA.
      track('cta_tapped', { cta: 'crew_down_for_im_down', crew_id: crewId });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: crewHomeKeys.downFor(crewId) });
      void qc.invalidateQueries({ queryKey: crewHomeKeys.home(crewId) });
    },
  });
  return mutation;
}

/** SKIP A WEEK (or put it back): set-to-state, safe to repeat. */
export function useSkipRitualWeek(crewId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { ritualId: string; occursOn: string; skip: boolean }) =>
      rpc('skip_ritual_week', { p_ritual_id: v.ritualId, p_occurs_on: v.occursOn, p_skip: v.skip }),
    retry: retryNetwork,
    onSuccess: (_s, v) => {
      if (v.skip) track('ritual_skip_tapped', { crew_id: crewId, ritual_id: v.ritualId });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: crewHomeKeys.rituals(crewId) });
      void qc.invalidateQueries({ queryKey: crewHomeKeys.home(crewId) });
    },
  });
}

/** MAKE THIS A RITUAL from the server's suggestion. One key per tap, reused on retry. */
export function useCreateRitual(crewId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      key: string;
      sportId: string;
      title: string;
      dayOfWeek: number;
      localTime: string;
      capacity: number;
      placeId: string | null;
    }) =>
      rpc('create_ritual', {
        p_idempotency_key: v.key,
        p_crew_id: crewId,
        p_sport_id: v.sportId,
        p_title: v.title,
        p_day_of_week: v.dayOfWeek,
        p_local_time: v.localTime,
        p_capacity: v.capacity,
        ...(v.placeId ? { p_place_id: v.placeId } : null),
      }),
    retry: retryNetwork,
    onSuccess: () => track('make_this_a_ritual_tapped', { crew_id: crewId }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: crewHomeKeys.rituals(crewId) });
      void qc.invalidateQueries({ queryKey: crewHomeKeys.home(crewId) });
    },
  });
}

/**
 * The chat's read mark (`mark_crew_chat_read`): when the chat opens, when a message arrives while it
 * is open, and when it closes, so Crew Home's "N NEW" clears. The server never moves it back, so
 * repeats are harmless; failures are quiet (the count just stays until the next mark).
 */
export function useMarkCrewChatRead(crewId: string, enabled: boolean, newestAt: string | null) {
  const qc = useQueryClient();
  const mark = useRef<() => void>(() => undefined);
  mark.current = () => {
    if (!crewId || !enabled) return;
    rpc('mark_crew_chat_read', { p_crew_id: crewId }).then(
      () => void qc.invalidateQueries({ queryKey: crewHomeKeys.home(crewId) }),
      () => undefined,
    );
  };
  useEffect(() => {
    mark.current();
  }, [crewId, enabled, newestAt]);
  useEffect(() => () => mark.current(), [crewId]);
}
