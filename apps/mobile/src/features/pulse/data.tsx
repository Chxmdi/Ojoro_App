/**
 * Reads for Pulse (docs/PLACES_CONTRACT.md, Pulse and Selected place sheet). `pulse` is a logged read
 * (POST, the default `rpc()`). Pulse has no clock of its own: refetch every PULSE_REFETCH_MS while
 * visible, on focus, and on a realtime hint on `pulse:{city}`.
 */
import {
  PULSE_REFETCH_MS,
  pulseSubscription,
  type PulseMarker,
  type PulsePlace,
  type PulseWhen,
} from '@ojoro/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { useRealtimeRefetch } from '@/lib/realtime';
import { rpc } from '@/lib/rpc';

import { retryNetwork } from '../crews/data';

export const pulseKeys = {
  all: ['pulse'] as const,
  markers: (sport: string | null, when: PulseWhen) => ['pulse', 'markers', sport ?? 'all', when] as const,
  place: (id: string, sport: string | null, when: PulseWhen) => ['pulse', 'place', id, sport ?? 'all', when] as const,
};

export function usePulse(sportId: string | null, when: PulseWhen, focused: boolean) {
  return useQuery({
    queryKey: pulseKeys.markers(sportId, when),
    queryFn: async () =>
      (await rpc('pulse', { ...(sportId ? { p_sport_id: sportId } : null), p_when: when })) as unknown as PulseMarker[],
    retry: retryNetwork,
    placeholderData: keepPreviousData,
    // Only while Pulse is on screen (it stays mounted under Place).
    refetchInterval: focused ? PULSE_REFETCH_MS : false,
  });
}

export function usePulsePlace(placeId: string | null, sportId: string | null, when: PulseWhen, focused: boolean) {
  return useQuery({
    queryKey: pulseKeys.place(placeId ?? '', sportId, when),
    queryFn: async () =>
      ((
        await rpc('pulse_place', {
          p_place_id: placeId ?? '',
          ...(sportId ? { p_sport_id: sportId } : null),
          p_when: when,
        })
      )[0] ?? null) as PulsePlace | null,
    retry: retryNetwork,
    enabled: !!placeId,
    // Only while Pulse is on screen (it stays mounted under Place).
    refetchInterval: focused ? PULSE_REFETCH_MS : false,
  });
}

/** A tick in the city refetches the markers and the open sheet. */
export function usePulseRealtime(city: string | null) {
  useRealtimeRefetch(city ? pulseSubscription(city) : null, [pulseKeys.all]);
}
