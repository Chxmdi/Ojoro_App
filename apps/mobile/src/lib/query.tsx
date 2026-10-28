import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { onlineManager, QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Platform } from 'react-native';
import type { ReactNode } from 'react';

// Queries pause while offline and resume when the device reconnects.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)),
);

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
      persistOptions={{ persister, maxAge: CACHE_MAX_AGE }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
