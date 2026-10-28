import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useState, type ReactNode } from 'react';

import { useUserId } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

import { initialDraft, type OnboardingDraft, type Privacy } from './draft';

type Ctx = {
  draft: OnboardingDraft;
  update: (change: (draft: OnboardingDraft) => OnboardingDraft) => void;
};

const OnboardingContext = createContext<Ctx | null>(null);

/** The catalog for OnboardSports (and the You screen's sport names). */
export function useSports() {
  return useQuery({
    queryKey: ['sports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sports')
        .select('id, name, sort_order')
        .order('sort_order');
      if (error) throw error;
      return data;
    },
    staleTime: 24 * 60 * 60 * 1000,
  });
}

/** Your own privacy row: the defaults OnboardPrivacy shows, and what settings edit. */
export const privacyKey = (userId: string) => ['privacy', userId] as const;

export function usePrivacySettings() {
  const userId = useUserId();
  return useQuery({
    queryKey: privacyKey(userId),
    queryFn: async (): Promise<Privacy | null> => {
      const { data, error } = await supabase
        .from('privacy_settings')
        .select('sports_visibility, history_visibility, availability_visibility')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        sports: data.sports_visibility,
        history: data.history_visibility,
        availability: data.availability_visibility,
      };
    },
  });
}

/**
 * The three onboarding steps share one draft, held by the (onboarding) layout, so going back and
 * forth keeps every choice. Nothing is saved until LET'S MOVE (one `save_onboarding` call).
 */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState(initialDraft);
  const update: Ctx['update'] = (change) => setDraft((current) => change(current));
  return <OnboardingContext value={{ draft, update }}>{children}</OnboardingContext>;
}

export function useOnboarding(): Ctx {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding outside OnboardingProvider');
  return ctx;
}
