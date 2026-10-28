import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { getSupabaseConfig } from './env';

// Literal reads: Expo inlines EXPO_PUBLIC_* only when each is referenced by its full name.
const config = getSupabaseConfig({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

/**
 * The one Supabase client for the app. Session lives in AsyncStorage and is refreshed in the
 * background while the app is in the foreground. Typed against the generated schema once the
 * Slice 01 data model exists (`supabase gen types`).
 */
// Static web rendering runs in Node, where AsyncStorage's web build has no `window`. There the
// session lives in memory for the length of the render; the browser and devices use AsyncStorage.
export function createMemoryStorage() {
  const memory = new Map<string, string>();
  return {
    getItem: async (key: string) => memory.get(key) ?? null,
    setItem: async (key: string, value: string) => void memory.set(key, value),
    removeItem: async (key: string) => void memory.delete(key),
  };
}
const isServer = Platform.OS === 'web' && typeof window === 'undefined';

export const supabase = createClient(config.url, config.publishableKey, {
  auth: {
    storage: isServer ? createMemoryStorage() : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Native app: auth links arrive through the `ojoro://` scheme, not the page URL.
    detectSessionInUrl: false,
    // Serialises token refreshes within the JS runtime (React Native has no Web Locks API).
    lock: processLock,
  },
});

// Refresh tokens only while the app is foregrounded, per Supabase's React Native guide. On web the
// client manages this itself.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}
