/** Area reads and writes (docs/LIQUIDITY_CONTRACT.md, Areas): areas_list, set_area, your label. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { rpc } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

import { check, retryNetwork } from '../plans/data';

export const areaKeys = {
  list: ['areas', 'list'] as const,
  mine: (userId: string | null) => ['me', 'area', userId] as const,
};

/** Neighbourhoods of public places. Public data; it changes only when places are added. */
export function useAreas() {
  return useQuery({
    queryKey: areaKeys.list,
    staleTime: 60 * 60_000,
    queryFn: () => rpc('areas_list', {}),
  });
}

/** Your profile's area label ("Plateau, Montréal"), or null. */
export function useMyAreaLabel(userId: string | null) {
  return useQuery({
    queryKey: areaKeys.mine(userId),
    enabled: userId !== null,
    queryFn: async () =>
      check(await supabase.from('profiles').select('area').eq('id', userId ?? '').maybeSingle())?.area ?? null,
  });
}

/**
 * set_area. A set-to-state operation (no key): repeating it changes nothing. Everything "near you"
 * depends on it, so Home, Discover, your profile and distances refetch.
 */
export function useSetArea(userId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    retry: retryNetwork,
    networkMode: 'online',
    mutationFn: (v: { label: string; radiusKm?: number | undefined }) =>
      rpc('set_area', {
        p_area: v.label,
        ...(v.radiusKm ? { p_discovery_radius_km: v.radiusKm } : null),
      }),
    onSuccess: (state) => {
      qc.setQueryData(areaKeys.mine(userId), state.area ?? null);
    },
    onSettled: () => {
      for (const key of [['home'], ['me'], ['profile'], ['discover'], ['create']]) {
        void qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}
