/**
 * Reads for the Place page (docs/PLACES_CONTRACT.md, Place). All reads; `place_view` is a logged read
 * (POST, the default `rpc()`). Keys start with ['place', id], so one realtime hint on `place:{id}`
 * refetches them all.
 */
import {
  placeSubscription,
  type PlaceGroup,
  type PlaceHost,
  type PlaceTonightItem,
  type PlaceView,
} from '@ojoro/contracts';
import { useQuery } from '@tanstack/react-query';

import { useRealtimeRefetch } from '@/lib/realtime';
import { rpc } from '@/lib/rpc';

import { retryNetwork } from '../crews/data';

export const placeKeys = {
  all: (id: string) => ['place', id] as const,
  view: (id: string) => ['place', id, 'view'] as const,
  tonight: (id: string) => ['place', id, 'tonight'] as const,
  groups: (id: string) => ['place', id, 'groups'] as const,
  hosts: (id: string) => ['place', id, 'hosts'] as const,
};

export function usePlaceView(id: string) {
  return useQuery({
    queryKey: placeKeys.view(id),
    queryFn: async () => ((await rpc('place_view', { p_place_id: id }))[0] ?? null) as PlaceView | null,
    retry: retryNetwork,
  });
}

export function usePlaceTonight(id: string, enabled: boolean) {
  return useQuery({
    queryKey: placeKeys.tonight(id),
    queryFn: async () => (await rpc('place_tonight', { p_place_id: id })) as unknown as PlaceTonightItem[],
    retry: retryNetwork,
    enabled,
  });
}

export function usePlaceGroups(id: string, enabled: boolean) {
  return useQuery({
    queryKey: placeKeys.groups(id),
    queryFn: async () => (await rpc('place_groups', { p_place_id: id })) as unknown as PlaceGroup[],
    retry: retryNetwork,
    enabled,
  });
}

export function usePlaceHosts(id: string, enabled: boolean) {
  return useQuery({
    queryKey: placeKeys.hosts(id),
    queryFn: async () => (await rpc('place_hosts', { p_place_id: id })) as unknown as PlaceHost[],
    retry: retryNetwork,
    enabled,
  });
}

/** Counts and TONIGHT HERE move with the place's realtime tick (a hint: refetch). */
export function usePlaceRealtime(id: string) {
  useRealtimeRefetch(placeSubscription(id), [placeKeys.view(id), placeKeys.tonight(id)]);
}
