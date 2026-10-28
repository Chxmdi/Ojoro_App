import { useQuery } from '@tanstack/react-query';

import { rpc } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

/**
 * Profile reads (contract: You). Keys start with 'profile' so onboarding and settings can
 * invalidate them together; a block invalidates everything.
 */
export const profileKeys = {
  view: (id: string) => ['profile', 'view', id] as const,
  sports: (id: string) => ['profile', 'sports', id] as const,
  reputation: (id: string) => ['profile', 'reputation', id] as const,
  availability: (id: string) => ['profile', 'availability', id] as const,
  passport: (id: string) => ['profile', 'passport', id] as const,
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

export type PassportSummary = {
  count: number;
  recent: {
    id: string;
    occurred_at: string;
    place_game_number: number | null;
    sport_game_number: number;
    place_name: string | null;
    place_time_zone: string | null;
    sport_name: string | null;
  }[];
};

/** Stamp count and the two most recent stamps (visible by the owner's history setting). */
export function usePassport(id: string, enabled = true) {
  return useQuery({
    queryKey: profileKeys.passport(id),
    enabled,
    queryFn: async (): Promise<PassportSummary> => {
      const { data, error, count } = await supabase
        .from('passport_entries')
        .select(
          'id, occurred_at, place_game_number, sport_game_number, places(name, time_zone), sports(name)',
          { count: 'exact' },
        )
        .eq('user_id', id)
        .order('occurred_at', { ascending: false })
        .limit(2);
      if (error) throw error;
      return {
        count: count ?? data.length,
        recent: data.map((row) => ({
          id: row.id,
          occurred_at: row.occurred_at,
          place_game_number: row.place_game_number,
          sport_game_number: row.sport_game_number,
          place_name: row.places?.name ?? null,
          place_time_zone: row.places?.time_zone ?? null,
          sport_name: row.sports?.name ?? null,
        })),
      };
    },
  });
}

/** People you blocked (blocked profiles are hidden from `profiles`, so names come from here). */
export function useMyBlocks() {
  return useQuery({
    queryKey: profileKeys.blocks(),
    queryFn: () => rpc('my_blocks', {}),
  });
}
