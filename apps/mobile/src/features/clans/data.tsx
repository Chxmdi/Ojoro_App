/**
 * Reads and writes for the Clan page (docs/COMMUNITIES_CONTRACT.md, Clans, Club runs, Mission and
 * leaderboard). Keys start with ['clan', id], so one realtime hint on `clan:{id}` refetches them all.
 */
import {
  clanSubscription,
  type ClanClash,
  type ClanLeaderboardRow,
  type ClanMission,
  type ClanRolePerson,
  type ClanRun,
  type ClanView,
  type MyClan,
} from '@ojoro/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { track } from '@/lib/analytics';
import { useRealtimeRefetch } from '@/lib/realtime';
import { rpc } from '@/lib/rpc';

import { retryNetwork } from '../crews/data';

export const clanKeys = {
  all: (id: string) => ['clan', id] as const,
  view: (id: string) => ['clan', id, 'view'] as const,
  week: (id: string) => ['clan', id, 'week'] as const,
  mission: (id: string) => ['clan', id, 'mission'] as const,
  clashes: (id: string) => ['clan', id, 'clashes'] as const,
  roles: (id: string) => ['clan', id, 'roles'] as const,
  leaderboard: (id: string) => ['clan', id, 'leaderboard'] as const,
  invite: (id: string) => ['clan', id, 'invite'] as const,
  mine: ['clans', 'mine'] as const,
};

export function useClanView(id: string) {
  return useQuery({
    queryKey: clanKeys.view(id),
    queryFn: async () => ((await rpc('clan_view', { p_clan_id: id }))[0] ?? null) as ClanView | null,
    retry: retryNetwork,
  });
}

export function useClanWeek(id: string, enabled: boolean) {
  return useQuery({
    queryKey: clanKeys.week(id),
    queryFn: async () => (await rpc('clan_week', { p_clan_id: id })) as unknown as ClanRun[],
    retry: retryNetwork,
    enabled,
  });
}

export function useClanMission(id: string, enabled: boolean) {
  return useQuery({
    queryKey: clanKeys.mission(id),
    queryFn: async () => ((await rpc('clan_mission', { p_clan_id: id }))[0] ?? null) as ClanMission | null,
    retry: retryNetwork,
    enabled,
  });
}

export function useClanClashes(id: string, enabled: boolean) {
  return useQuery({
    queryKey: clanKeys.clashes(id),
    queryFn: async () => (await rpc('clan_clashes', { p_clan_id: id })) as unknown as ClanClash[],
    retry: retryNetwork,
    enabled,
  });
}

export function useClanRoles(id: string, enabled: boolean) {
  return useQuery({
    queryKey: clanKeys.roles(id),
    queryFn: async () => (await rpc('clan_roles', { p_clan_id: id })) as unknown as ClanRolePerson[],
    retry: retryNetwork,
    enabled,
  });
}

/** Members only (the server says `not_clan_member` otherwise), so it waits for `is_member`. */
export function useClanLeaderboard(id: string, enabled: boolean) {
  return useQuery({
    queryKey: clanKeys.leaderboard(id),
    queryFn: async () => (await rpc('clan_leaderboard', { p_clan_id: id, p_limit: 3 })) as unknown as ClanLeaderboardRow[],
    retry: retryNetwork,
    enabled,
  });
}

export function useClanInviteCode(id: string) {
  return useMutation({
    mutationFn: () => rpc('clan_invite_code', { p_clan_id: id }),
    retry: retryNetwork,
  });
}

export function useMyClans(enabled = true) {
  return useQuery({
    queryKey: clanKeys.mine,
    queryFn: async () => (await rpc('my_clans', {})) as unknown as MyClan[],
    retry: retryNetwork,
    enabled,
  });
}

export function useClanRealtime(id: string) {
  useRealtimeRefetch(id ? clanSubscription(id) : null, [clanKeys.all(id)]);
}

// Writes -----------------------------------------------------------------------------------------

/** JOIN (open clans) or REQUEST TO JOIN: set-to-state, safe to repeat. */
export function useJoinClan(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => rpc('join_clan', { p_clan_id: id }),
    retry: retryNetwork,
    onSuccess: (state) => {
      track('cta_tapped', { cta: state.status === 'member' ? 'clan_join' : 'clan_request', clan_id: id });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: clanKeys.all(id) });
      void qc.invalidateQueries({ queryKey: clanKeys.mine });
    },
  });
}

export function useWithdrawClanRequest(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => rpc('withdraw_clan_request', { p_clan_id: id }),
    retry: retryNetwork,
    onSettled: () => void qc.invalidateQueries({ queryKey: clanKeys.view(id) }),
  });
}

export function useLeaveClan(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => rpc('leave_clan', { p_clan_id: id }),
    retry: retryNetwork,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: clanKeys.all(id) });
      void qc.invalidateQueries({ queryKey: clanKeys.mine });
    },
  });
}

export function useSetClanLeaderboard(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (on: boolean) => rpc('set_clan_leaderboard', { p_clan_id: id, p_on: on }),
    retry: retryNetwork,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: clanKeys.view(id) });
      void qc.invalidateQueries({ queryKey: clanKeys.leaderboard(id) });
    },
  });
}

/** I'M DOWN on a club run. Optimistic count; set-to-state on the server, so a retry is safe. */
export function useJoinClanRun(clanId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => rpc('join_clan_run', { p_run_id: runId }),
    retry: retryNetwork,
    onMutate: async (runId) => {
      await qc.cancelQueries({ queryKey: clanKeys.week(clanId) });
      const previous = qc.getQueryData<ClanRun[]>(clanKeys.week(clanId));
      qc.setQueryData<ClanRun[]>(clanKeys.week(clanId), (rows) =>
        (rows ?? []).map((r) => (r.run_id === runId && !r.i_am_down ? { ...r, i_am_down: true, down_count: r.down_count + 1 } : r)),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(clanKeys.week(clanId), ctx.previous);
    },
    onSuccess: (_s, runId) => track('cta_tapped', { cta: 'clan_run_im_down', clan_id: clanId, run_id: runId }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: clanKeys.week(clanId) });
      void qc.invalidateQueries({ queryKey: clanKeys.mission(clanId) });
    },
  });
}
