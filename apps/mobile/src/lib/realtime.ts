import type { RealtimeSubscription } from '@ojoro/contracts';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { supabase } from './supabase';

/**
 * Keeps queries fresh from a realtime subscription. Realtime is a hint, not the source of truth
 * (contract): every change, every (re)subscribe and every return to the foreground refetches the
 * given queries. Pass `null` to subscribe to nothing (e.g. before an id is known).
 */
export function useRealtimeRefetch(
  subscription: RealtimeSubscription | null,
  queryKeys: QueryKey[],
) {
  const queryClient = useQueryClient();
  const channelName = subscription?.channel ?? null;
  const keysJson = JSON.stringify(queryKeys);

  useEffect(() => {
    if (!subscription) return;
    const keys = JSON.parse(keysJson) as QueryKey[];
    const refetch = () => {
      for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
    };

    let channel = supabase.channel(subscription.channel);
    for (const change of subscription.changes) {
      channel = channel.on('postgres_changes' as never, change as never, refetch);
    }
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') refetch();
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') refetch();
    });

    return () => {
      appState.remove();
      void supabase.removeChannel(channel);
    };
    // The channel name identifies the subscription; its filters derive from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, keysJson, queryClient]);
}
