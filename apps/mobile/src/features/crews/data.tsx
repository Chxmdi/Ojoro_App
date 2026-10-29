/**
 * Reads and writes for crews and CrewChat (docs/MESSAGING_CONTRACT.md, Crews, Chat, Make This a
 * Game). Every key for one crew starts with ['crew', id], so one realtime hint on `crew:{id}`
 * refetches the header, roster, messages and the suggestion together.
 */
import { crewChatSubscription, isRetryable } from '@ojoro/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { track } from '@/lib/analytics';
import { newIdempotencyKey } from '@/lib/idempotency';
import { useRealtimeRefetch } from '@/lib/realtime';
import { ojoroErrorOf, OjoroCallError, rpc } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';
import { toOjoroError } from '@ojoro/contracts';

import type { CrewRole, MakeGameDraft, SuggestionFacts } from './logic';
import { makeGameArgs, suggestionSignature } from './logic';

export const crewKeys = {
  all: (id: string) => ['crew', id] as const,
  view: (id: string) => ['crew', id, 'view'] as const,
  roster: (id: string) => ['crew', id, 'roster'] as const,
  suggestions: (id: string) => ['crew', id, 'suggestions'] as const,
  invite: (id: string) => ['crew', id, 'invite'] as const,
  mine: ['crews', 'mine'] as const,
  sports: ['sports', 'catalog'] as const,
  playedWith: ['crews', 'played-with'] as const,
};

export function retryNetwork(failures: number, error: unknown): boolean {
  return failures < 2 && isRetryable(ojoroErrorOf(error));
}

export type CrewView = {
  crew_id: string;
  name: string;
  sport_id: string | null;
  member_count: number;
  my_role: CrewRole | null;
  free_tonight: number | null;
  time_zone: string;
  created_at: string;
};

export type RosterRow = {
  user_id: string;
  display_name: string;
  avatar_path: string | null;
  role: CrewRole;
  joined_at: string;
  is_me: boolean;
  games_with_me: number | null;
};

export type MyCrew = {
  crew_id: string;
  name: string;
  sport_id: string | null;
  role: CrewRole;
  member_count: number;
  joined_at: string;
  last_message_at: string | null;
};

export type Suggestion = SuggestionFacts & {
  crew_id: string;
  interested_names: string[];
  accepted_at: string | null;
  expires_at: string;
};

export function useCrewView(id: string) {
  return useQuery({
    queryKey: crewKeys.view(id),
    queryFn: async () => ((await rpc('crew_view', { p_crew_id: id }))[0] ?? null) as CrewView | null,
    retry: retryNetwork,
  });
}

export function useCrewRoster(id: string, enabled = true) {
  return useQuery({
    queryKey: crewKeys.roster(id),
    queryFn: async () => (await rpc('crew_roster', { p_crew_id: id })) as unknown as RosterRow[],
    retry: retryNetwork,
    enabled,
  });
}

export function useMyCrews() {
  return useQuery({
    queryKey: crewKeys.mine,
    queryFn: async () => (await rpc('my_crews', {})) as unknown as MyCrew[],
    retry: retryNetwork,
  });
}

/** VOLATILE: runs detection, so it's a POST (supabase.rpc's default), never `{ get: true }`. */
export function useCrewSuggestions(id: string, enabled = true) {
  return useQuery({
    queryKey: crewKeys.suggestions(id),
    queryFn: async () => (await rpc('chat_suggestions', { p_crew_id: id })) as unknown as Suggestion[],
    retry: retryNetwork,
    enabled,
  });
}

export function useInviteCode(id: string, enabled: boolean) {
  return useQuery({
    queryKey: crewKeys.invite(id),
    queryFn: () => rpc('crew_invite_code', { p_crew_id: id }),
    retry: retryNetwork,
    enabled,
    staleTime: 5 * 60_000,
  });
}

export type SportRow = { id: string; name: string; default_capacity: number; sort_order: number };

export function useSportsCatalog() {
  return useQuery({
    queryKey: crewKeys.sports,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sports')
        .select('id,name,default_capacity,sort_order')
        .order('sort_order');
      if (error) throw new OjoroCallError(toOjoroError(error));
      return (data ?? []) as SportRow[];
    },
    staleTime: 60 * 60_000,
    retry: retryNetwork,
  });
}

/** People you've played with: the only people a crew can add directly (contract, Crews). */
export function usePlayedWith() {
  return useQuery({
    queryKey: crewKeys.playedWith,
    queryFn: async () =>
      (await rpc('people_to_move_with', { p_limit: 50 })).filter((p) => p.played_together),
    retry: retryNetwork,
  });
}

/**
 * CrewChat and the crew page. Messages and members refetch the header, roster and thread on any
 * change. Suggestion rows get their own channel that refetches `chat_suggestions` only when a fact
 * changed (`suggestionSignature`): the read runs detection and rewrites the row, so refetching on
 * every row event would loop between everyone in the crew (docs/DESIGN_DECISIONS.md, Step 4
 * screens).
 */
export function useCrewRealtime(id: string) {
  const base = id ? crewChatSubscription(id) : null;
  useRealtimeRefetch(
    base ? { channel: base.channel, changes: base.changes.filter((c) => c.table !== 'chat_suggestions') } : null,
    [crewKeys.view(id), crewKeys.roster(id), ['crew', id, 'messages']],
  );
  useSuggestionRealtime(id);
}

function useSuggestionRealtime(id: string) {
  const qc = useQueryClient();
  // Two screens can watch one crew (the crew page under its chat); each gets its own topic name.
  const [instance] = useState(() => Math.random().toString(36).slice(2, 10));
  const seen = useRef(new Map<string, string>());
  useEffect(() => {
    if (!id) return undefined;
    const refetch = () => void qc.invalidateQueries({ queryKey: crewKeys.suggestions(id) });
    const channel = supabase
      .channel(`crew-suggestions:${id}:${instance}`)
      .on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table: 'chat_suggestions', filter: `crew_id=eq.${id}` } as never,
        (payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
          const row = payload.new && Object.keys(payload.new).length > 0 ? payload.new : payload.old;
          const rowId = typeof row?.id === 'string' ? row.id : null;
          if (!row || !rowId) return refetch();
          const sig = suggestionSignature(row);
          if (seen.current.get(rowId) === sig) return undefined;
          seen.current.set(rowId, sig);
          refetch();
          return undefined;
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') refetch();
      });
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') refetch();
    });
    return () => {
      appState.remove();
      void supabase.removeChannel(channel);
    };
  }, [id, instance, qc]);
}

// Writes -----------------------------------------------------------------------------------------

/** NOT NOW: hidden for you at once, still there for everyone else. */
export function useDismissSuggestion(crewId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (suggestionId: string) => rpc('dismiss_suggestion', { p_suggestion_id: suggestionId }),
    retry: retryNetwork,
    onMutate: async (suggestionId) => {
      await qc.cancelQueries({ queryKey: crewKeys.suggestions(crewId) });
      const previous = qc.getQueryData<Suggestion[]>(crewKeys.suggestions(crewId));
      qc.setQueryData<Suggestion[]>(crewKeys.suggestions(crewId), (rows) =>
        (rows ?? []).filter((r) => r.id !== suggestionId),
      );
      track('chat_suggestion_not_now_tapped', { crew_id: crewId });
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(crewKeys.suggestions(crewId), ctx.previous);
    },
  });
}

/** MAKE THIS A GAME. The caller holds one key per tap (reused on retry), so it creates one plan. */
export function useMakeThisAGame(crewId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { suggestionId: string; draft: MakeGameDraft; key: string }) =>
      rpc('make_this_a_game', makeGameArgs(v.suggestionId, v.draft, v.key)),
    retry: retryNetwork,
    onSuccess: (state, v) => {
      track('make_this_a_game_tapped', {
        crew_id: crewId,
        times: v.draft.times.length,
        place_picked: !!v.draft.placeId,
        created: !!state.created,
      });
      void qc.invalidateQueries({ queryKey: crewKeys.all(crewId) });
    },
  });
}

export function useRotateCode(crewId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => rpc('crew_invite_code', { p_crew_id: crewId, p_rotate: true }),
    retry: retryNetwork,
    onSuccess: (code) => {
      qc.setQueryData(crewKeys.invite(crewId), code);
      track('crew_code_rotated', { crew_id: crewId });
    },
  });
}

export function useLeaveCrew(crewId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => rpc('leave_crew', { p_crew_id: crewId }),
    retry: retryNetwork,
    onSuccess: () => {
      track('crew_leave_tapped', { crew_id: crewId });
      qc.removeQueries({ queryKey: crewKeys.all(crewId) });
      void qc.invalidateQueries({ queryKey: crewKeys.mine });
    },
  });
}

export function useJoinCrew() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => rpc('join_crew', { p_code: code }),
    retry: retryNetwork,
    onSuccess: (crewId) => {
      track('crew_join_tapped', { crew_id: crewId });
      void qc.invalidateQueries({ queryKey: crewKeys.mine });
    },
  });
}

/** One key per START THE CREW intention, reused on retry; cleared after an answer. */
export function useCreateCrew() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { key: string; name: string; sportId: string | null; memberIds: string[] }) =>
      rpc('create_crew', {
        p_idempotency_key: v.key,
        p_name: v.name,
        p_member_ids: v.memberIds,
        ...(v.sportId ? { p_sport_id: v.sportId } : null),
      }),
    retry: retryNetwork,
    onSuccess: (crew, v) => {
      track('crew_create_tapped', { crew_id: crew.id, members: v.memberIds.length, sport: v.sportId });
      void qc.invalidateQueries({ queryKey: crewKeys.mine });
    },
  });
}

export { newIdempotencyKey };
