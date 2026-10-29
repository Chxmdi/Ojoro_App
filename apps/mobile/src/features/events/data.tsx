/**
 * Reads and writes for a Challenge Event (docs/COMPETITION_CONTRACT.md, Event page). Every key starts
 * with ['event', id]; the `challenge:{id}` channel (the event row, check-ins, feed, comments, polls,
 * submissions) refetches them all. Shared by every stage screen: EventBuildup and EventToday (here),
 * EventLive, Verifying and Result (liveData.tsx) and Rivalry read `useEvent`.
 *
 * Follow, predict and back are set-to-state writes (the same call twice changes nothing), so they
 * are optimistic and safely retried. Respect toggles, so it is never retried blindly. No money
 * anywhere: predictions and backing are social counts.
 */
import {
  challengeEventSubscription,
  isRetryable,
  type ChallengeComment,
  type ChallengeEventView,
  type ChallengeFeedPost,
  type ChallengePoll,
  type ChallengePoster,
  type ChallengeSide,
} from '@ojoro/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { track } from '@/lib/analytics';
import { useRealtimeRefetch } from '@/lib/realtime';
import { ojoroErrorOf, rpc } from '@/lib/rpc';

import { applyBacking, applyFollow, applyPrediction, applyPollVote, applyRespect } from './logic';

export const eventKeys = {
  all: (id: string) => ['event', id] as const,
  view: (id: string) => ['event', id, 'view'] as const,
  feed: (id: string) => ['event', id, 'feed'] as const,
  comments: (id: string) => ['event', id, 'comments'] as const,
  polls: (id: string) => ['event', id, 'polls'] as const,
  poster: (id: string) => ['event', id, 'poster'] as const,
  /** Verifying and Result (Agent C) keep their reads under this prefix too. */
  verification: (id: string) => ['event', id, 'verification'] as const,
};

export const FEED_PAGE = 20;
export const COMMENTS_PAGE = 30;

export function retryNetwork(failures: number, error: unknown): boolean {
  return failures < 2 && isRetryable(ojoroErrorOf(error));
}

type Nullable<T> = { [K in keyof T]: T[K] | null };
/** Columns the server always fills; the generated types claim the rest are too, but they aren't. */
type Always = 'id' | 'stage' | 'status' | 'server_now' | 'starts_at' | 'a_name' | 'b_name' | 'format' | 'scoring';

/** One `challenge_event_view` row, with the nullable columns typed as nullable. */
export type EventView = Nullable<Omit<ChallengeEventView, Always>> & Pick<ChallengeEventView, Always>;
export type EventData = { row: EventView; receivedAt: number } | null;

export type FeedPost = Nullable<Omit<ChallengeFeedPost, 'id' | 'kind' | 'created_at'>> &
  Pick<ChallengeFeedPost, 'id' | 'kind' | 'created_at'>;
export type EventComment = Nullable<Omit<ChallengeComment, 'id' | 'created_at'>> &
  Pick<ChallengeComment, 'id' | 'created_at'>;
export type EventPoll = Nullable<Omit<ChallengePoll, 'id' | 'options' | 'vote_counts' | 'question'>> &
  Pick<ChallengePoll, 'id' | 'options' | 'vote_counts' | 'question'>;
export type EventPoster = Nullable<ChallengePoster>;

/**
 * The event page's main read (stage, sides, counts, crowd, the viewer's own picks), with the
 * device time the answer arrived so countdowns anchor on `server_now`. Null when the event isn't
 * found or isn't open to the viewer.
 */
export function useEvent(eventId: string) {
  return useQuery({
    queryKey: eventKeys.view(eventId),
    queryFn: async (): Promise<EventData> => {
      const row = (await rpc('challenge_event_view', { p_event_id: eventId }))[0];
      return row ? { row: row as unknown as EventView, receivedAt: Date.now() } : null;
    },
    enabled: !!eventId,
    retry: retryNetwork,
  });
}

/** Realtime as a refetch hint for everything under ['event', id]. */
export function useEventRealtime(eventId: string) {
  useRealtimeRefetch(eventId ? challengeEventSubscription(eventId) : null, [eventKeys.all(eventId)]);
}

export function useEventFeed(eventId: string, enabled = true) {
  const q = useInfiniteQuery({
    queryKey: eventKeys.feed(eventId),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      (await rpc('challenge_feed', {
        p_event_id: eventId,
        p_limit: FEED_PAGE,
        ...(pageParam ? { p_before: pageParam } : null),
      })) as unknown as FeedPost[],
    getNextPageParam: (last) => (last.length < FEED_PAGE ? undefined : (last[last.length - 1]?.id ?? undefined)),
    retry: retryNetwork,
    enabled,
  });
  const posts = useMemo(() => dedupe((q.data?.pages ?? []).flat()), [q.data]);
  return { ...q, posts };
}

export function useEventComments(eventId: string, enabled = true) {
  const q = useInfiniteQuery({
    queryKey: eventKeys.comments(eventId),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      (await rpc('challenge_comments', {
        p_event_id: eventId,
        p_limit: COMMENTS_PAGE,
        ...(pageParam ? { p_before: pageParam } : null),
      })) as unknown as EventComment[],
    // A page holds COMMENTS_PAGE top-level comments plus their replies; page on the oldest top one.
    getNextPageParam: (last) => {
      const tops = last.filter((c) => !c.parent_id);
      return tops.length < COMMENTS_PAGE ? undefined : (tops[tops.length - 1]?.id ?? undefined);
    },
    retry: retryNetwork,
    enabled,
  });
  const comments = useMemo(() => dedupe((q.data?.pages ?? []).flat()), [q.data]);
  return { ...q, comments };
}

export function useEventPolls(eventId: string, enabled = true) {
  return useQuery({
    queryKey: eventKeys.polls(eventId),
    queryFn: async () => (await rpc('challenge_polls', { p_event_id: eventId })) as unknown as EventPoll[],
    retry: retryNetwork,
    enabled,
  });
}

/** The share poster's facts. The server refuses (poster_not_allowed) when the event isn't public. */
export function useEventPoster(eventId: string) {
  return useQuery({
    queryKey: eventKeys.poster(eventId),
    queryFn: async () =>
      ((await rpc('challenge_poster', { p_event_id: eventId }))[0] ?? null) as unknown as EventPoster | null,
    retry: retryNetwork,
    enabled: !!eventId,
  });
}

function dedupe<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

// Writes ----------------------------------------------------------------------------------------

/** Patch the event row in the cache; returns the previous value for rollback. */
function useEventPatch(eventId: string) {
  const qc = useQueryClient();
  return {
    qc,
    async begin(patch: (row: EventView) => EventView) {
      await qc.cancelQueries({ queryKey: eventKeys.view(eventId) });
      const prev = qc.getQueryData<EventData>(eventKeys.view(eventId));
      qc.setQueryData<EventData>(eventKeys.view(eventId), (old) => (old ? { ...old, row: patch(old.row) } : old));
      return prev;
    },
    rollback(prev: EventData | undefined) {
      if (prev !== undefined) qc.setQueryData(eventKeys.view(eventId), prev);
    },
    merge(fields: Partial<EventView>) {
      qc.setQueryData<EventData>(eventKeys.view(eventId), (prev) =>
        prev ? { ...prev, row: { ...prev.row, ...fields } } : prev,
      );
    },
    settle() {
      return qc.invalidateQueries({ queryKey: eventKeys.view(eventId) });
    },
  };
}

/** FOLLOW / Following. Set-to-state, optimistic, retried on a dropped connection. */
export function useFollowEvent(eventId: string) {
  const p = useEventPatch(eventId);
  return useMutation({
    mutationFn: (follow: boolean) =>
      follow
        ? rpc('follow_challenge_event', { p_event_id: eventId })
        : rpc('unfollow_challenge_event', { p_event_id: eventId }),
    retry: retryNetwork,
    onMutate: async (follow) => {
      track('cta_tapped', { cta: follow ? 'event_follow' : 'event_unfollow', event_id: eventId });
      return { prev: await p.begin((row) => applyFollow(row, follow)) };
    },
    onError: (_e, _v, ctx) => p.rollback(ctx?.prev),
    onSuccess: (s) => {
      if (s.following !== null && s.follower_count !== null) {
        p.merge({ i_follow: s.following, follower_count: s.follower_count, comments_muted: s.comments_muted });
      }
    },
    onSettled: () => p.settle(),
  });
}

/** MUTE COMMENTS: follow with comments muted (or not). Set-to-state. */
export function useMuteComments(eventId: string) {
  const p = useEventPatch(eventId);
  return useMutation({
    mutationFn: (muted: boolean) =>
      rpc('follow_challenge_event', { p_event_id: eventId, p_comments_muted: muted }),
    retry: retryNetwork,
    onMutate: async (muted) => {
      track('cta_tapped', { cta: muted ? 'event_mute_comments' : 'event_unmute_comments', event_id: eventId });
      return { prev: await p.begin((row) => ({ ...applyFollow(row, true), comments_muted: muted })) };
    },
    onError: (_e, _v, ctx) => p.rollback(ctx?.prev),
    onSettled: () => p.settle(),
  });
}

type CrowdState = {
  prediction_count: number | null;
  prediction_a_pct: number | null;
  prediction_b_pct: number | null;
  my_prediction: ChallengeSide | null;
  predictions_locked: boolean | null;
  backing_a: number | null;
  backing_b: number | null;
  my_backing: ChallengeSide | null;
};

function crowdFields(s: CrowdState): Partial<EventView> {
  return {
    prediction_count: s.prediction_count,
    prediction_a_pct: s.prediction_a_pct,
    prediction_b_pct: s.prediction_b_pct,
    my_prediction: s.my_prediction,
    predictions_locked: s.predictions_locked,
    backing_a: s.backing_a,
    backing_b: s.backing_b,
    my_backing: s.my_backing,
  };
}

/** WHO TAKES IT?: change any time until LIVE. The server answers with the real split. */
export function usePredict(eventId: string) {
  const p = useEventPatch(eventId);
  return useMutation({
    mutationFn: (side: ChallengeSide) => rpc('predict_challenge', { p_event_id: eventId, p_side: side }),
    retry: retryNetwork,
    onMutate: async (side) => {
      track('cta_tapped', { cta: 'prediction_made', side, event_id: eventId });
      return { prev: await p.begin((row) => applyPrediction(row, side)) };
    },
    onError: (_e, _v, ctx) => p.rollback(ctx?.prev),
    onSuccess: (s) => p.merge(crowdFields(s as CrowdState)),
    onSettled: () => p.settle(),
  });
}

/** BACK a side, switch, or stop (null): separate from the prediction, never affects the result. */
export function useBack(eventId: string) {
  const p = useEventPatch(eventId);
  return useMutation({
    // p_side null stops backing (contract); the generated type doesn't say it's nullable.
    mutationFn: (side: ChallengeSide | null) =>
      rpc('back_challenge', { p_event_id: eventId, p_side: side as ChallengeSide }),
    retry: retryNetwork,
    onMutate: async (side) => {
      track('cta_tapped', { cta: side ? 'crowd_backed' : 'crowd_unbacked', side, event_id: eventId });
      return { prev: await p.begin((row) => applyBacking(row, side)) };
    },
    onError: (_e, _v, ctx) => p.rollback(ctx?.prev),
    onSuccess: (s) => p.merge(crowdFields(s as CrowdState)),
    onSettled: () => p.settle(),
  });
}

/** A poll vote: set-to-state (your vote moves), optimistic. */
export function useVotePoll(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { pollId: string; option: number }) =>
      rpc('vote_challenge_poll', { p_poll_id: v.pollId, p_option: v.option }),
    retry: retryNetwork,
    onMutate: async (v) => {
      track('cta_tapped', { cta: 'event_poll_voted', event_id: eventId });
      await qc.cancelQueries({ queryKey: eventKeys.polls(eventId) });
      const prev = qc.getQueryData<EventPoll[]>(eventKeys.polls(eventId));
      if (prev) {
        qc.setQueryData<EventPoll[]>(
          eventKeys.polls(eventId),
          prev.map((poll) => (poll.id === v.pollId ? applyPollVote(poll, v.option) : poll)),
        );
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(eventKeys.polls(eventId), ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: eventKeys.polls(eventId) }),
  });
}

type CommentsData = { pages: EventComment[][]; pageParams: unknown[] };

/** RESPECT toggles: optimistic, rolled back on an error, never retried blindly. */
export function useRespectComment(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => rpc('respect_challenge_comment', { p_comment_id: commentId }),
    retry: false,
    onMutate: async (commentId) => {
      track('reaction_tapped', { event_id: eventId, reaction: 'respect', on: 'comment' });
      await qc.cancelQueries({ queryKey: eventKeys.comments(eventId) });
      const prev = qc.getQueryData<CommentsData>(eventKeys.comments(eventId));
      if (prev) {
        qc.setQueryData<CommentsData>(eventKeys.comments(eventId), {
          ...prev,
          pages: prev.pages.map((page) => page.map((c) => (c.id === commentId ? applyRespect(c) : c))),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(eventKeys.comments(eventId), ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: eventKeys.comments(eventId) }),
  });
}

/** ADD TO THE CROWD: one idempotency key per comment, reused on every retry. */
export function useComment(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { body: string; key: string; parentId?: string | undefined }) =>
      rpc('comment_on_challenge', {
        p_event_id: eventId,
        p_body: v.body,
        p_idempotency_key: v.key,
        ...(v.parentId ? { p_parent_id: v.parentId } : null),
      }),
    retry: retryNetwork,
    onSuccess: () => track('cta_tapped', { cta: 'event_comment_posted', event_id: eventId }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: eventKeys.comments(eventId) });
      return qc.invalidateQueries({ queryKey: eventKeys.view(eventId) });
    },
  });
}

/** A competitor's post in the hype feed (statement, training). Idempotent by key. */
export function usePostToFeed(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { body: string; key: string; kind: 'statement' | 'training' | 'logistics' }) =>
      rpc('post_challenge_update', { p_event_id: eventId, p_body: v.body, p_kind: v.kind, p_idempotency_key: v.key }),
    retry: retryNetwork,
    onSuccess: (_d, v) => track('cta_tapped', { cta: 'event_post', kind: v.kind, event_id: eventId }),
    onSettled: () => qc.invalidateQueries({ queryKey: eventKeys.feed(eventId) }),
  });
}

/** Check in on the day (competitors). Set-to-state. */
export function useCheckInChallenge(eventId: string) {
  const p = useEventPatch(eventId);
  return useMutation({
    mutationFn: () => rpc('check_in_challenge', { p_event_id: eventId }),
    retry: retryNetwork,
    onMutate: () => track('check_in_tapped', { event_id: eventId, kind: 'challenge' }),
    onSuccess: (s) => {
      if (s.a_checked_in !== null && s.b_checked_in !== null) {
        p.merge({ a_checked_in: s.a_checked_in, b_checked_in: s.b_checked_in, ...(s.stage ? { stage: s.stage } : null) });
      }
    },
    onSettled: () => p.settle(),
  });
}

/** I'M READY (competitors). Set-to-state; when both are ready the event goes live. */
export function useReady(eventId: string) {
  const p = useEventPatch(eventId);
  return useMutation({
    mutationFn: () => rpc('ready_challenge', { p_event_id: eventId }),
    retry: retryNetwork,
    onMutate: () => track('cta_tapped', { cta: 'challenge_ready', event_id: eventId }),
    onSuccess: (s) => {
      p.merge({
        ...(s.a_ready !== null ? { a_ready: s.a_ready } : null),
        ...(s.b_ready !== null ? { b_ready: s.b_ready } : null),
        ...(s.stage ? { stage: s.stage } : null),
      });
    },
    onSettled: () => p.qc.invalidateQueries({ queryKey: eventKeys.all(eventId) }),
  });
}
