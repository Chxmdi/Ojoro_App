/**
 * Reads for the activity screens (docs/SLICE01_CONTRACT.md, Screens) and the small hooks they
 * share: realtime refetch, a ticking clock for time-based status, online state and intent keys.
 * Every key starts with ['activity', id], so one realtime hint refetches the whole screen.
 */
import { activitySubscription, isRetryable } from '@ojoro/contracts';
import { onlineManager, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { newIdempotencyKey } from '@/lib/idempotency';
import { useRealtimeRefetch } from '@/lib/realtime';
import { ojoroErrorOf, OjoroCallError, rpc } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';
import { toOjoroError } from '@ojoro/contracts';

import { DEFAULT_TIME_ZONE } from './format';
import type { ActivityCard, RosterRow } from './model';

export const activityKeys = {
  all: (id: string) => ['activity', id] as const,
  card: (id: string) => ['activity', id, 'card'] as const,
  roster: (id: string) => ['activity', id, 'roster'] as const,
  place: (id: string) => ['activity', id, 'place'] as const,
  meeting: (id: string) => ['activity', id, 'meeting'] as const,
  myArea: (id: string) => ['activity', id, 'my-area'] as const,
};

/** Throws the supabase error as an OjoroCallError so screens map it to words. */
function check<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new OjoroCallError(toOjoroError(result.error));
  return result.data;
}

/** Retry reads and writes only when the network dropped (an ojoro error is an answer). */
export function retryNetwork(failureCount: number, error: unknown): boolean {
  return failureCount < 3 && isRetryable(ojoroErrorOf(error));
}

export function useActivityCard(id: string) {
  return useQuery({
    queryKey: activityKeys.card(id),
    queryFn: async () =>
      check(await supabase.from('activity_cards').select('*').eq('id', id).maybeSingle()) as ActivityCard | null,
    retry: retryNetwork,
  });
}

export function useActivityRoster(id: string, enabled = true) {
  return useQuery({
    queryKey: activityKeys.roster(id),
    queryFn: async () => (await rpc('activity_roster', { p_activity_id: id })) as unknown as RosterRow[],
    retry: retryNetwork,
    enabled,
  });
}

export type PlaceInfo = { lat: number; lng: number; time_zone: string; name: string };

/** The place's centroid and time zone (activity_cards has neither). */
export function usePlace(activityId: string, placeId: string | null | undefined) {
  return useQuery({
    queryKey: [...activityKeys.place(activityId), placeId ?? null],
    queryFn: async () =>
      check(
        await supabase.from('places').select('lat,lng,time_zone,name').eq('id', placeId ?? '').maybeSingle(),
      ) as PlaceInfo | null,
    enabled: !!placeId,
    staleTime: 60 * 60 * 1000,
    retry: retryNetwork,
  });
}

/** The exact spot. RLS returns it to people in the plan only; others get null. */
export function useMeetingPoint(activityId: string, planId: string | null | undefined) {
  return useQuery({
    queryKey: [...activityKeys.meeting(activityId), planId ?? null],
    queryFn: async () =>
      check(
        await supabase
          .from('plan_meeting_points')
          .select('label,lat,lng')
          .eq('plan_id', planId ?? '')
          .maybeSingle(),
      ) as { label: string; lat: number | null; lng: number | null } | null,
    enabled: !!planId,
    retry: retryNetwork,
  });
}

/** Your own coarse area (0.01°), for "1.2 km" on the header. Never sent anywhere. */
export function useMyArea(activityId: string, userId: string | null) {
  return useQuery({
    queryKey: [...activityKeys.myArea(activityId), userId],
    queryFn: async () =>
      check(
        await supabase
          .from('profile_private')
          .select('area_lat,area_lng')
          .eq('user_id', userId ?? '')
          .maybeSingle(),
      ) as { area_lat: number | null; area_lng: number | null } | null,
    enabled: !!userId,
    staleTime: 60 * 60 * 1000,
    retry: retryNetwork,
  });
}

/** Realtime for the activity channel: every hint refetches every read of this activity. */
export function useActivityRealtime(id: string) {
  useRealtimeRefetch(id ? activitySubscription(id) : null, [activityKeys.all(id)]);
}

/** Re-renders every `ms`, so time-based status (check-in opens, live, after) moves without a fetch. */
export function useNow(ms = 15_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Online, from NetInfo through react-query's onlineManager. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
    () => true,
  );
}

/**
 * One idempotency key per user intention: made on the first tap, reused on every retry after a
 * dropped connection, cleared once the server answered (success or a coded error).
 */
export function useIntentKey() {
  const ref = useRef<string | null>(null);
  return {
    key(): string {
      ref.current ??= newIdempotencyKey();
      return ref.current;
    },
    settle(error: unknown): void {
      if (!error || !isRetryable(ojoroErrorOf(error))) ref.current = null;
    },
  };
}

/** The place's time zone once known; Montréal until then. */
export function timeZoneOf(place: PlaceInfo | null | undefined): string {
  return place?.time_zone ?? DEFAULT_TIME_ZONE;
}
