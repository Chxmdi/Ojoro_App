import type { RealtimeSubscription } from '@ojoro/contracts';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect, useEffectEvent } from 'react';
import { AppState } from 'react-native';

import { supabase } from './supabase';

type Listener = () => void;
type Entry = { channel: RealtimeChannel; listeners: Set<Listener>; subscribed: boolean };

/**
 * One channel per topic, shared by every screen watching it. Supabase returns the existing channel
 * for a topic and can't take new callbacks once subscribed, so screens stacked on the same plan or
 * activity (Activity under Check-in) must share. Exported for tests.
 */
export const channels = new Map<string, Entry>();

export function watchTopic(subscription: RealtimeSubscription, listener: Listener): () => void {
  let entry = channels.get(subscription.channel);
  if (!entry) {
    const listeners = new Set<Listener>();
    const notify = () => {
      for (const l of listeners) l();
    };
    let channel = supabase.channel(subscription.channel);
    for (const change of subscription.changes) {
      channel = channel.on('postgres_changes' as never, change as never, notify);
    }
    const created: Entry = { channel, listeners, subscribed: false };
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        created.subscribed = true;
        notify();
      }
    });
    entry = created;
    channels.set(subscription.channel, entry);
  } else if (entry.subscribed) {
    // A late joiner missed the SUBSCRIBED refetch; catch it up now.
    listener();
  }
  entry.listeners.add(listener);
  const shared = entry;

  return () => {
    shared.listeners.delete(listener);
    if (shared.listeners.size === 0) {
      channels.delete(subscription.channel);
      void supabase.removeChannel(shared.channel);
    }
  };
}

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
  const refetch = useEffectEvent(() => {
    for (const queryKey of queryKeys) void queryClient.invalidateQueries({ queryKey });
  });
  const channelName = subscription?.channel ?? null;
  // The channel name identifies the subscription; its filters derive from the same id.
  const current = useEffectEvent(() => subscription);

  useEffect(() => {
    const sub = current();
    if (!channelName || !sub) return undefined;
    const stop = watchTopic(sub, () => refetch());
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') refetch();
    });
    return () => {
      appState.remove();
      stop();
    };
  }, [channelName]);
}
