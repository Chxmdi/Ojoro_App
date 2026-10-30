import {
  passportStampsArgs,
  passportSubscription,
  PASSPORT_STAMPS_PAGE,
  type ChallengePassportForMe,
  type ClearGoalResult,
  type GoalView,
  type PassportAchievement,
  type PassportReputation,
  type PassportStamp,
  type PassportStampsFilter,
  type PassportView,
  type Visibility,
} from '@ojoro/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { retryNetwork } from '@/features/plans/data';
import { newIdempotencyKey } from '@/lib/idempotency';
import { useRealtimeRefetch } from '@/lib/realtime';
import { rpc } from '@/lib/rpc';

import { filterKey, type GoalArgs } from './logic';

/**
 * Passport reads and goal writes (docs/PASSPORT_CONTRACT.md). Keys start with 'passport' and the
 * owner's id, so a new stamp or goal change refetches everything about that person's Passport.
 */
export const passportKeys = {
  all: (userId: string) => ['passport', userId] as const,
  view: (userId: string) => ['passport', userId, 'view'] as const,
  stamps: (userId: string, filter: PassportStampsFilter) => ['passport', userId, 'stamps', filterKey(filter)] as const,
  achievements: (userId: string) => ['passport', userId, 'achievements'] as const,
  reputation: (userId: string) => ['passport', userId, 'reputation'] as const,
  goal: (userId: string) => ['passport', userId, 'goal'] as const,
  challenge: (eventId: string) => ['passport', 'challenge', eventId] as const,
};

/** The whole page in one call; null when there's no such person or a block either way. */
export function usePassportView(userId: string, enabled = true) {
  return useQuery({
    queryKey: passportKeys.view(userId),
    enabled: enabled && Boolean(userId),
    queryFn: async () => ((await rpc('passport_view', { p_user_id: userId })) as unknown as PassportView | null) ?? null,
  });
}

/** Stamps, newest first, a page at a time (`p_before` = the last row's time). */
export function usePassportStamps(userId: string, filter: PassportStampsFilter, enabled = true) {
  return useInfiniteQuery({
    queryKey: passportKeys.stamps(userId, filter),
    enabled: enabled && Boolean(userId),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      (await rpc('passport_stamps', passportStampsArgs(userId, filter, pageParam))) as unknown as PassportStamp[],
    getNextPageParam: (last) =>
      last.length >= PASSPORT_STAMPS_PAGE ? (last[last.length - 1]?.occurred_at ?? null) : null,
  });
}

export function usePassportAchievements(userId: string, enabled = true) {
  return useQuery({
    queryKey: passportKeys.achievements(userId),
    enabled: enabled && Boolean(userId),
    queryFn: async () =>
      (await rpc('passport_achievements', { p_user_id: userId })) as unknown as PassportAchievement[],
  });
}

export function usePassportReputation(userId: string, enabled = true) {
  return useQuery({
    queryKey: passportKeys.reputation(userId),
    enabled: enabled && Boolean(userId),
    queryFn: async () =>
      ((await rpc('passport_reputation', { p_user_id: userId })) as unknown as PassportReputation | null) ?? null,
  });
}

/** The active goal: yours, or theirs while their goals setting includes you. Null when none. */
export function usePassportGoal(userId: string, enabled = true) {
  return useQuery({
    queryKey: passportKeys.goal(userId),
    enabled: enabled && Boolean(userId),
    queryFn: async () => ((await rpc('passport_goal', { p_user_id: userId })) as unknown as GoalView | null) ?? null,
  });
}

/** Your stamp for a finished Challenge (Result's YOU row); null when you didn't compete. */
export function useChallengePassportForMe(eventId: string, enabled = true) {
  return useQuery({
    queryKey: passportKeys.challenge(eventId),
    enabled: enabled && Boolean(eventId),
    queryFn: async () =>
      ((await rpc('challenge_passport_for_me', { p_event_id: eventId })) as unknown as ChallengePassportForMe[])[0] ??
      null,
  });
}

/** New stamps, personal bests and goal changes refetch this person's Passport (a hint, not truth). */
export function usePassportRealtime(userId: string | null) {
  useRealtimeRefetch(userId ? passportSubscription(userId) : null, userId ? [passportKeys.all(userId)] : []);
}

function useInvalidateMine(userId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: passportKeys.all(userId) });
    void qc.invalidateQueries({ queryKey: ['profile'] });
  };
}

/**
 * SET GOAL / change it. One idempotency key per intention: the sheet opening makes it, retries and
 * a second tap reuse it, and a successful save starts a new one.
 */
export function useSetGoal(userId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateMine(userId);
  const key = useRef<string | null>(null);
  const mutation = useMutation({
    mutationKey: ['passport', userId, 'set_goal'],
    retry: retryNetwork,
    mutationFn: (v: { args: GoalArgs; key: string }) =>
      rpc('set_goal', { ...v.args, p_idempotency_key: v.key }) as unknown as Promise<GoalView>,
    onSuccess: (goal) => {
      key.current = null;
      qc.setQueryData(passportKeys.goal(userId), goal);
    },
    onSettled: invalidate,
  });
  return {
    ...mutation,
    /** Starts a new intention (the sheet opened). */
    begin: () => {
      key.current = newIdempotencyKey();
    },
    save: (args: GoalArgs, options?: Parameters<typeof mutation.mutate>[1]) => {
      if (mutation.isPending) return;
      key.current ??= newIdempotencyKey();
      mutation.mutate({ args, key: key.current }, options);
    },
  };
}

/** CLEAR GOAL: set-to-state, safe to repeat. */
export function useClearGoal(userId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateMine(userId);
  return useMutation({
    retry: retryNetwork,
    mutationFn: () => rpc('clear_goal', {}) as unknown as Promise<ClearGoalResult>,
    onSuccess: () => qc.setQueryData(passportKeys.goal(userId), null),
    onSettled: invalidate,
  });
}

/** Who sees your goal: set-to-state. */
export function useSetGoalsVisibility(userId: string) {
  const invalidate = useInvalidateMine(userId);
  return useMutation({
    retry: retryNetwork,
    mutationFn: (visibility: Visibility) => rpc('set_goals_visibility', { p_visibility: visibility }),
    onSettled: invalidate,
  });
}
