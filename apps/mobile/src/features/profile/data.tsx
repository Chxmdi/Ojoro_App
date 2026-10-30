import { useQuery } from '@tanstack/react-query';

import { rpc } from '@/lib/rpc';

/**
 * Profile reads (contract: You). Keys start with 'profile' so onboarding and settings can
 * invalidate them together; a block invalidates everything.
 */
export const profileKeys = {
  view: (id: string) => ['profile', 'view', id] as const,
  sports: (id: string) => ['profile', 'sports', id] as const,
  reputation: (id: string) => ['profile', 'reputation', id] as const,
  availability: (id: string) => ['profile', 'availability', id] as const,
  blocks: () => ['profile', 'blocks'] as const,
};

/** One row, or null when blocked either way or no such person (never says which). */
export function useProfileView(id: string) {
  return useQuery({
    queryKey: profileKeys.view(id),
    queryFn: async () => {
      const rows = await rpc('profile_view', { p_user_id: id });
      return rows[0] ?? null;
    },
  });
}

export function useProfileSports(id: string, enabled = true) {
  return useQuery({
    queryKey: profileKeys.sports(id),
    queryFn: () => rpc('profile_sports', { p_user_id: id }),
    enabled,
  });
}

export function useProfileReputation(id: string, enabled = true) {
  return useQuery({
    queryKey: profileKeys.reputation(id),
    queryFn: () => rpc('profile_reputation', { p_user_id: id }),
    enabled,
  });
}

export function useAvailabilityOverlap(id: string, enabled = true) {
  return useQuery({
    queryKey: profileKeys.availability(id),
    queryFn: () => rpc('availability_overlap', { p_user_id: id }),
    enabled,
  });
}

/** People you blocked (blocked profiles are hidden from `profiles`, so names come from here). */
export function useMyBlocks() {
  return useQuery({
    queryKey: profileKeys.blocks(),
    queryFn: () => rpc('my_blocks', {}),
  });
}
