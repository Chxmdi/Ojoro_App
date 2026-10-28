import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { onlineManager, QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Platform } from 'react-native';
import type { ReactNode } from 'react';

// Queries pause while offline and resume when the device reconnects. On web, NetInfo only follows
// navigator.connection, so the browser's own online/offline events are wired in as well.
onlineManager.setEventListener((setOnline) => {
  const stopNetInfo = NetInfo.addEventListener((state) => setOnline(state.isConnected !== false));
  if (Platform.OS !== 'web' || typeof window === 'undefined') return stopNetInfo;
  const online = () => setOnline(true);
  const offline = () => setOnline(false);
  window.addEventListener('online', online);
  window.addEventListener('offline', offline);
  return () => {
    stopNetInfo();
    window.removeEventListener('online', online);
    window.removeEventListener('offline', offline);
  };
});

/** The last known state survives a restart for a day, so offline screens keep their counts. */
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: CACHE_MAX_AGE,
      retry: 2,
    },
    mutations: {
      // Mutations carry idempotency keys, so a retry after a dropped connection is safe.
      retry: 2,
      networkMode: 'offlineFirst',
    },
  },
});

const isServer = Platform.OS === 'web' && typeof window === 'undefined';

const persister = createAsyncStoragePersister({
  storage: isServer ? null : AsyncStorage,
  key: 'ojoro-query-cache',
});

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: CACHE_MAX_AGE,
        // Queued taps resume after a reconnect in the same session. They are not saved across a
        // restart: resuming them needs a registered mutationFn per action (docs/DESIGN_DECISIONS.md).
        dehydrateOptions: { shouldDehydrateMutation: () => false },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
