/** Home reads (contract, Screens: Main). Everything sits under ['home'] so one invalidation refreshes it. */
import { createFromDemandArgs, invitesSubscription, type LatentDemandBucket } from '@ojoro/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { newIdempotencyKey } from '@/lib/idempotency';
import { useRealtimeRefetch } from '@/lib/realtime';
import { rpc } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

import { check, checkRows, retryNetwork, type PlanCard } from '../plans/data';
import type { FeedCard } from './homeLogic';

export function useDownsNearby() {
  return useQuery({ queryKey: ['home', 'downs'], queryFn: () => rpc('down_for_nearby', {}) });
}

export function usePlansNearby() {
  return useQuery({ queryKey: ['home', 'nearby'], queryFn: () => rpc('plans_nearby', {}) });
}

/** Plans you're in that are still forming or on (GAME ON reached while you were elsewhere shows here). */
export function useMyPlans(userId: string | null) {
  return useQuery({
    queryKey: ['home', 'mine', userId],
    enabled: userId !== null,
    queryFn: async (): Promise<PlanCard[]> => {
      const plans = checkRows(
        await supabase
          .from('plan_cards')
          .select('*')
          .eq('i_am_in', true)
          .in('effective_status', ['forming', 'game_on'])
          .gt('starts_at', new Date(Date.now() - 3 * 3600_000).toISOString())
          .order('starts_at')
          .limit(10),
      );
      // A plan stays game_on when its game is called off or over; leave those to the Activity.
      const activityIds = plans.map((p) => p.activity_id).filter((a): a is string => a !== null);
      if (activityIds.length === 0) return plans;
      const games = checkRows(
        await supabase.from('activity_cards').select('id, effective_status').in('id', activityIds),
      );
      const done = new Set(
        games.filter((g) => g.effective_status !== 'confirmed').map((g) => g.id),
      );
      return plans.filter((p) => !p.activity_id || !done.has(p.activity_id));
    },
  });
}

/** Plans someone pulled you into (pending invites). The invitee sees who's in, the time and the place. */
export function useInvitedPlans(userId: string | null) {
  return useQuery({
    queryKey: ['home', 'invites', userId],
    enabled: userId !== null,
    queryFn: async (): Promise<PlanCard[]> => {
      const invites = checkRows(
        await supabase
          .from('plan_invites')
          .select('plan_id')
          .eq('invitee_id', userId ?? '')
          .eq('status', 'pending'),
      );
      if (invites.length === 0) return [];
      return checkRows(
        await supabase
          .from('plan_cards')
          .select('*')
          .in(
            'id',
            invites.map((i) => i.plan_id),
          )
          .eq('effective_status', 'forming')
          .order('starts_at'),
      );
    },
  });
}

/** Your last game's recap (through your newest Passport stamp), with the activity's title. */
export function useLastRecap(userId: string | null) {
  return useQuery({
    queryKey: ['home', 'recap', userId],
    enabled: userId !== null,
    queryFn: async () => {
      const entry = check(
        await supabase
          .from('passport_entries')
          .select('activity_id, occurred_at')
          .eq('user_id', userId ?? '')
          // Game stamps only: a Challenge stamp (Step 7) has no activity or recap.
          .not('activity_id', 'is', null)
          .order('occurred_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      );
      if (!entry?.activity_id) return null;
      const activityId = entry.activity_id;
      const [recap, activity] = await Promise.all([
        supabase.from('recaps').select('*').eq('activity_id', activityId).maybeSingle(),
        supabase.from('activity_cards').select('title, sport_name').eq('id', activityId).maybeSingle(),
      ]);
      const r = check(recap);
      if (!r) return null;
      const a = check(activity);
      return { recap: r, title: a?.title ?? a?.sport_name ?? null };
    },
  });
}

/** Invites addressed to you refresh Home (contract, Realtime: Home). */
export function useHomeRealtime(userId: string | null) {
  useRealtimeRefetch(userId ? invitesSubscription(userId) : null, [['home']]);
}

/* ---------- Step 3: FirstHome (docs/LIQUIDITY_CONTRACT.md) ---------- */

/** Picks the normal Main feed or FirstHome, honestly (one row). */
export function useHomeDensity() {
  return useQuery({
    queryKey: ['home', 'density'],
    queryFn: async () => (await rpc('home_density', {}))[0] ?? null,
  });
}

/** Latent demand near you. A logged read: plain POST rpc, never `{ get: true }`. */
export function useLatentDemand(enabled: boolean) {
  return useQuery({
    queryKey: ['home', 'demand'],
    enabled,
    queryFn: () => rpc('latent_demand', {}),
  });
}

/** A BIT FURTHER OUT: beyond your radius, up to twice it. */
export function useFurtherOut(enabled: boolean) {
  return useQuery({
    queryKey: ['home', 'further'],
    enabled,
    queryFn: () => rpc('further_out', { p_limit: 5 }),
  });
}

/** Your sports, main first (self only), to choose the demand and the quick chips. */
export function useMySportIds(userId: string | null) {
  return useQuery({
    queryKey: ['me', 'sports', userId],
    enabled: userId !== null,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const rows = checkRows(
        await supabase.from('user_sports').select('sport_id, is_main').eq('user_id', userId ?? ''),
      );
      return [...rows].sort((a, b) => Number(b.is_main) - Number(a.is_main)).map((r) => r.sport_id);
    },
  });
}

/**
 * I'M DOWN on a latent demand bucket: create_from_demand with one key per tap (retries reuse it,
 * so the server forms or joins exactly one plan). A second tap while it's saving does nothing.
 */
export function useCreateFromDemand() {
  const qc = useQueryClient();
  const busy = useRef(false);
  const mutation = useMutation({
    retry: retryNetwork,
    mutationFn: (v: { bucket: Pick<LatentDemandBucket, 'sport_id' | 'suggested_start' | 'window_end'>; key: string }) =>
      rpc('create_from_demand', createFromDemandArgs(v.bucket, v.key)),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['home'] });
      void qc.invalidateQueries({ queryKey: ['create'] });
    },
  });
  const tap = (
    bucket: Pick<LatentDemandBucket, 'sport_id' | 'suggested_start' | 'window_end'>,
    options?: Parameters<typeof mutation.mutate>[1],
  ) => {
    if (busy.current || mutation.isPending) return;
    busy.current = true;
    mutation.mutate(
      { bucket, key: newIdempotencyKey() },
      {
        ...options,
        onSettled: (...args) => {
          busy.current = false;
          options?.onSettled?.(...args);
        },
      },
    );
  };
  return { ...mutation, tap };
}

/* ---------- Step 4: the action feed (docs/MESSAGING_CONTRACT.md, Main: home_feed) ---------- */

/** The ranked, finite feed: one card per object, at most 12, then `caught_up`. */
export function useHomeFeed(enabled = true) {
  return useQuery({
    queryKey: ['home', 'feed'],
    enabled,
    queryFn: async () => (await rpc('home_feed', {})) as unknown as FeedCard[],
  });
}

/** The plan cards behind the feed's your_plan cards (count, status, roster link), in feed order. */
export function useFeedPlans(ids: readonly string[]) {
  const key = [...ids].sort().join(',');
  return useQuery({
    queryKey: ['home', 'feed-plans', key],
    enabled: ids.length > 0,
    queryFn: async (): Promise<PlanCard[]> =>
      checkRows(await supabase.from('plan_cards').select('*').in('id', [...ids])),
  });
}

/** A recap from the feed, with the facts its headline needs. */
export function useRecap(activityId: string | null) {
  return useQuery({
    queryKey: ['home', 'recap-of', activityId],
    enabled: activityId !== null,
    queryFn: async () =>
      check(await supabase.from('recaps').select('*').eq('activity_id', activityId ?? '').maybeSingle()),
  });
}
