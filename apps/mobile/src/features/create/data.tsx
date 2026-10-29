/** Create reads and writes (docs/LIQUIDITY_CONTRACT.md, Create). Everything sits under ['create']. */
import type { RpcArgs } from '@ojoro/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { newIdempotencyKey } from '@/lib/idempotency';
import { rpc } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

import { checkRows, retryNetwork } from '../plans/data';
import { CONCIERGE_DEBOUNCE_MS, conciergeQuery } from './conciergeLogic';

/** The text after the person stops typing for a moment. */
export function useDebounced<T>(value: T, ms: number = CONCIERGE_DEBOUNCE_MS): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}

/**
 * TELL OJORO. A logged read (the server records `concierge_suggested`, never the text), so it's a
 * plain POST rpc, never `{ get: true }`. Only asked once there's something to read.
 */
export function useConcierge(text: string) {
  const q = conciergeQuery(useDebounced(text));
  return {
    query: q,
    ...useQuery({
      queryKey: ['create', 'concierge', q],
      enabled: q !== null,
      staleTime: 60_000,
      placeholderData: keepPreviousData,
      queryFn: () => rpc('concierge_suggest', { p_text: q as string, p_limit: 3 }),
    }),
  };
}

/** Places for the form: the public catalog with their sports. */
export function usePlaces() {
  return useQuery({
    queryKey: ['create', 'places'],
    staleTime: 60 * 60_000,
    queryFn: async () =>
      checkRows(await supabase.from('places').select('id, name, area, city, sport_ids, time_zone').order('name')),
  });
}

/** Sports with their default capacity, for the form. */
export function useSportCatalog() {
  return useQuery({
    queryKey: ['create', 'sports'],
    staleTime: 24 * 3600_000,
    queryFn: async () =>
      checkRows(await supabase.from('sports').select('id, name, default_capacity, sort_order').order('sort_order')),
  });
}

type CreateArgs = Omit<RpcArgs<'create_plan'>, 'p_idempotency_key'>;

/** create_plan with one key per tap: a retry (network only) returns the same plan, never a second. */
export function useCreatePlan() {
  const qc = useQueryClient();
  const busy = useRef(false);
  const mutation = useMutation({
    retry: retryNetwork,
    networkMode: 'online',
    mutationFn: (v: { args: CreateArgs; key: string }) => rpc('create_plan', { ...v.args, p_idempotency_key: v.key }),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['home'] }),
  });
  const tap = (args: CreateArgs, options?: Parameters<typeof mutation.mutate>[1]) => {
    if (busy.current || mutation.isPending) return;
    busy.current = true;
    mutation.mutate(
      { args, key: newIdempotencyKey() },
      {
        ...options,
        onSettled: (...a) => {
          busy.current = false;
          options?.onSettled?.(...a);
        },
      },
    );
  };
  return { ...mutation, tap };
}
