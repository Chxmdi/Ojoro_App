import type { Database } from '@ojoro/contracts';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getAdminConfig } from './lib/env';

export const config = getAdminConfig({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
    string | undefined,
});

/**
 * The one Supabase client: publishable key plus the staff member's own session (kept in this
 * origin's localStorage). Every staff power is checked by the staff RPCs on the server.
 */
export const supabase: SupabaseClient<Database> | null = config.ok
  ? createClient<Database>(config.config.url, config.config.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'ojoro-staff-auth',
      },
    })
  : null;
