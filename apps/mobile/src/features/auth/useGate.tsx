import { useIsRestoring, useQuery } from '@tanstack/react-query';
import { createContext, useContext } from 'react';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

import { gateFor, type Gate, type ProfileGateInfo } from './gate';

/** The query that decides between onboarding and the app. Onboarding writes its result here. */
export const profileGateKey = (userId: string) => ['profile', 'gate', userId] as const;

export async function fetchProfileGate(userId: string): Promise<ProfileGateInfo | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, onboarding_completed_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    onboardingCompleted: data.onboarding_completed_at !== null,
    hasName: (data.display_name ?? '').trim().length > 0,
  };
}

/** Computes the gate from the session and the profile (cached for offline launches). */
export function useGateState(): { gate: Gate; retry: () => void } {
  const auth = useAuth();
  const restoring = useIsRestoring();
  const userId = auth.status === 'signed-in' ? auth.session.user.id : null;
  const profile = useQuery({
    queryKey: profileGateKey(userId ?? 'none'),
    queryFn: () => fetchProfileGate(userId!),
    enabled: userId !== null && !restoring,
    retry: 1,
  });
  const gate: Gate = restoring
    ? { kind: 'loading' }
    : gateFor(auth.status, { status: profile.status, data: profile.data });
  return { gate, retry: () => void profile.refetch() };
}

export const GateContext = createContext<{ gate: Gate; retry: () => void }>({
  gate: { kind: 'loading' },
  retry: () => {},
});

export function useGate() {
  return useContext(GateContext);
}
