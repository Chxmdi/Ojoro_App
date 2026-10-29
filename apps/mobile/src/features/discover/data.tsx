/**
 * Discover reads and writes (docs/LIQUIDITY_CONTRACT.md, Screens: Discover). Everything sits under
 * ['discover'] so one invalidation refreshes the tab; the persisted cache keeps the last state for
 * offline. Logged reads (ojoro_now, latent_demand, surprise_me, discover_search) go through `rpc()`,
 * which POSTs.
 */
import { createFromDemandArgs } from '@ojoro/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { newIdempotencyKey } from '@/lib/idempotency';
import { rpc } from '@/lib/rpc';

import { retryNetwork } from '../plans/data';
import type { DemandBucket, NearbyPlace, NowItem, Person, SearchArgs, SearchRow, SuggestionRow } from './logic';

export const discoverKeys = {
  all: ['discover'] as const,
  density: ['discover', 'density'] as const,
  now: ['discover', 'now'] as const,
  demand: ['discover', 'demand'] as const,
  people: ['discover', 'people'] as const,
  places: ['discover', 'places'] as const,
  sports: ['discover', 'sports'] as const,
  search: (args: SearchArgs) => ['discover', 'search', args] as const,
};

const retry = retryNetwork;

export function useHomeDensity() {
  return useQuery({
    queryKey: discoverKeys.density,
    retry,
    queryFn: async () => (await rpc('home_density', {}))[0] ?? null,
  });
}

export function useOjoroNow() {
  return useQuery({
    queryKey: discoverKeys.now,
    retry,
    queryFn: async () => (await rpc('ojoro_now', {})) as unknown as NowItem[],
  });
}

export function useLatentDemand() {
  return useQuery({
    queryKey: discoverKeys.demand,
    retry,
    queryFn: async () => (await rpc('latent_demand', {})) as unknown as DemandBucket[],
  });
}

export function usePeopleToMoveWith() {
  return useQuery({
    queryKey: discoverKeys.people,
    retry,
    queryFn: async () => (await rpc('people_to_move_with', {})) as unknown as Person[],
  });
}

export function usePlacesNearby() {
  return useQuery({
    queryKey: discoverKeys.places,
    retry,
    queryFn: async () => (await rpc('places_nearby', {})) as unknown as NearbyPlace[],
  });
}

export function useSportsNearby() {
  return useQuery({
    queryKey: discoverKeys.sports,
    retry,
    queryFn: () => rpc('sports_nearby', {}),
  });
}

/** Search results for settled arguments; the previous results stay on screen while the next load. */
export function useDiscoverSearch(args: SearchArgs | null) {
  return useQuery({
    queryKey: discoverKeys.search(args ?? {}),
    enabled: args !== null,
    retry,
    placeholderData: keepPreviousData,
    queryFn: async () => (await rpc('discover_search', args ?? {})) as unknown as SearchRow[],
  });
}

/** `value`, once it has stopped changing for `ms`. */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}

/**
 * MAKE IT HAPPEN: create_from_demand with one key per intention. A second tap while the first is in
 * flight does nothing; a retry (the mutation's own, or after a dropped connection) reuses the key.
 */
export function useMakeItHappen() {
  const qc = useQueryClient();
  const busy = useRef(false);
  const mutation = useMutation({
    retry,
    mutationFn: (v: { bucket: Pick<DemandBucket, 'sport_id' | 'suggested_start' | 'window_end'>; key: string }) =>
      rpc('create_from_demand', createFromDemandArgs(v.bucket, v.key)),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: discoverKeys.all });
      void qc.invalidateQueries({ queryKey: ['home'] });
    },
  });
  const tap = (
    bucket: Pick<DemandBucket, 'sport_id' | 'suggested_start' | 'window_end'>,
    options?: Parameters<typeof mutation.mutate>[1],
  ) => {
    if (busy.current || mutation.isPending) return false;
    busy.current = true;
    mutation.mutate(
      { bucket, key: newIdempotencyKey() },
      {
        ...options,
        onSettled: (...args) => {
          busy.current = false;
          options?.onSettled?.(...args);
        },
      },
    );
    return true;
  };
  return { ...mutation, tap };
}

/** SURPRISE ME: one suggestion (or none). A logged read, so it runs on the tap, not on mount. */
export function useSurpriseMe() {
  return useMutation({
    retry,
    networkMode: 'online',
    mutationFn: async () => ((await rpc('surprise_me', {})) as unknown as SuggestionRow[])[0] ?? null,
  });
}
