/**
 * Reads and writes for LiveActivity (docs/MESSAGING_CONTRACT.md, Live). Every key starts with
 * ['live', id]; the `live:{id}` channel (score, freshness, followers, game reactions, new posts,
 * status) refetches them all. `react` toggles, so it is never retried blindly: the optimistic
 * state rolls back on an error and the next fetch settles the counts.
 */
import { activityLiveSubscription, isRetryable, type ReactionWord } from '@ojoro/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { track } from '@/lib/analytics';
import { useRealtimeRefetch } from '@/lib/realtime';
import { ojoroErrorOf, rpc } from '@/lib/rpc';

import { activityKeys } from '../activities/data';
import { applyReaction, readCounts, type LiveFacts, type UpdateRow } from './logic';

export const liveKeys = {
  all: (id: string) => ['live', id] as const,
  state: (id: string) => ['live', id, 'state'] as const,
  feed: (id: string) => ['live', id, 'feed'] as const,
};

export const FEED_PAGE = 30;

function retryNetwork(failures: number, error: unknown): boolean {
  return failures < 2 && isRetryable(ojoroErrorOf(error));
}

export type LiveState = LiveFacts & { activity_id: string; ends_at: string; ended_at: string | null; starts_at: string };

/** activity_live, with the device time the answer arrived (the clock anchors on it). */
export function useLiveState(id: string) {
  return useQuery({
    queryKey: liveKeys.state(id),
    queryFn: async () => {
      const row = (await rpc('activity_live', { p_activity_id: id }))[0];
      return row ? { row: row as unknown as LiveState, receivedAt: Date.now() } : null;
    },
    retry: retryNetwork,
  });
}

export function useUpdatesFeed(id: string, enabled = true) {
  const q = useInfiniteQuery({
    queryKey: liveKeys.feed(id),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      (await rpc('activity_updates_feed', {
        p_activity_id: id,
        p_limit: FEED_PAGE,
        ...(pageParam ? { p_before: pageParam } : null),
      })) as unknown as UpdateRow[],
    getNextPageParam: (last) => (last.length < FEED_PAGE ? undefined : (last[last.length - 1]?.id ?? undefined)),
    retry: retryNetwork,
    enabled,
  });
  const updates = useMemo(() => {
    const seen = new Set<string>();
    return (q.data?.pages ?? []).flat().filter((u) => (seen.has(u.id) ? false : (seen.add(u.id), true)));
  }, [q.data]);
  return { ...q, updates };
}

export function useLiveRealtime(id: string) {
  useRealtimeRefetch(id ? activityLiveSubscription(id) : null, [liveKeys.all(id)]);
}

type StateData = { row: LiveState; receivedAt: number } | null;
type FeedData = { pages: UpdateRow[][]; pageParams: unknown[] };

/**
 * A reaction tap: optimistic on the game or the post, rolled back if the write fails. The server's
 * answer (counts and yours) replaces the guess.
 */
export function useReact(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { word: ReactionWord; updateId: string | null }) =>
      rpc('react', { p_activity_id: id, p_reaction: v.word, ...(v.updateId ? { p_update_id: v.updateId } : null) }),
    onMutate: async (v) => {
      track('reaction_tapped', { activity_id: id, reaction: v.word, on: v.updateId ? 'post' : 'game' });
      await qc.cancelQueries({ queryKey: liveKeys.all(id) });
      const prevState = qc.getQueryData<StateData>(liveKeys.state(id));
      const prevFeed = qc.getQueryData<FeedData>(liveKeys.feed(id));
      if (!v.updateId && prevState) {
        const next = applyReaction({ counts: readCounts(prevState.row.reaction_counts), mine: prevState.row.my_reaction }, v.word);
        const optimistic: StateData = {
          ...prevState,
          row: { ...prevState.row, reaction_counts: next.counts, my_reaction: next.mine },
        };
        qc.setQueryData(liveKeys.state(id), optimistic);
      }
      if (v.updateId && prevFeed) {
        qc.setQueryData<FeedData>(liveKeys.feed(id), {
          ...prevFeed,
          pages: prevFeed.pages.map((page) =>
            page.map((u) => {
              if (u.id !== v.updateId) return u;
              const next = applyReaction({ counts: readCounts(u.reaction_counts), mine: u.my_reaction }, v.word);
              return { ...u, reaction_counts: next.counts, my_reaction: next.mine };
            }),
          ),
        });
      }
      return { prevState, prevFeed };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prevState !== undefined) qc.setQueryData(liveKeys.state(id), ctx.prevState);
      if (ctx?.prevFeed !== undefined) qc.setQueryData(liveKeys.feed(id), ctx.prevFeed);
    },
    onSuccess: (state, v) => {
      if (!v.updateId) {
        qc.setQueryData<StateData>(liveKeys.state(id), (prev) =>
          prev ? { ...prev, row: { ...prev.row, reaction_counts: state.reaction_counts, my_reaction: state.my_reaction ?? null } } : prev,
        );
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: liveKeys.all(id) }),
  });
}

/** Set-to-state: the same score twice changes nothing on the server, so retries are safe. */
export function useLogScore(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { a: number; b: number }) => rpc('log_score', { p_activity_id: id, p_team_a: v.a, p_team_b: v.b }),
    retry: retryNetwork,
    onSuccess: () => track('live_score_logged_tapped', { activity_id: id }),
    onSettled: () => qc.invalidateQueries({ queryKey: liveKeys.all(id) }),
  });
}

export function usePostUpdate(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { body: string; key: string }) =>
      rpc('post_update', { p_activity_id: id, p_body: v.body, p_idempotency_key: v.key }),
    retry: retryNetwork,
    onSuccess: () => track('live_update_posted_tapped', { activity_id: id }),
    onSettled: () => qc.invalidateQueries({ queryKey: liveKeys.all(id) }),
  });
}

export function useFollow(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (follow: boolean) =>
      follow ? rpc('follow_activity', { p_activity_id: id }) : rpc('unfollow_activity', { p_activity_id: id }),
    retry: retryNetwork,
    onMutate: async (follow) => {
      track(follow ? 'activity_follow_tapped' : 'activity_unfollow_tapped', { activity_id: id });
      await qc.cancelQueries({ queryKey: liveKeys.state(id) });
      const prev = qc.getQueryData<StateData>(liveKeys.state(id));
      if (prev && prev.row.i_follow !== follow) {
        const optimistic: StateData = {
          ...prev,
          row: { ...prev.row, i_follow: follow, follower_count: Math.max(0, prev.row.follower_count + (follow ? 1 : -1)) },
        };
        qc.setQueryData(liveKeys.state(id), optimistic);
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(liveKeys.state(id), ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: liveKeys.all(id) }),
  });
}

/** FULL TIME: Slice 01's end_activity (host). After opens. */
export function useFullTime(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => rpc('end_activity', { p_activity_id: id }),
    retry: retryNetwork,
    onSuccess: () => {
      track('cta_tapped', { cta: 'full_time', activity_id: id, from: 'live' });
      void qc.invalidateQueries({ queryKey: activityKeys.all(id) });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: liveKeys.all(id) }),
  });
}
