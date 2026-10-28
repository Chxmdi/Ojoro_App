import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { queryClient } from './query';
import { supabase } from './supabase';

type AuthState =
  { status: 'loading' } | { status: 'signed-out' } | { status: 'signed-in'; session: Session };

const AuthContext = createContext<AuthState>({ status: 'loading' });

/** Tracks the Supabase session. Signing out clears the cached data of the previous user. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setState(
        data.session ? { status: 'signed-in', session: data.session } : { status: 'signed-out' },
      );
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') queryClient.clear();
      setState(session ? { status: 'signed-in', session } : { status: 'signed-out' });
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext value={state}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/** The signed-in user's id. Only call below a signed-in gate. */
export function useUserId(): string {
  const state = useAuth();
  if (state.status !== 'signed-in') throw new Error('useUserId called while signed out');
  return state.session.user.id;
}
