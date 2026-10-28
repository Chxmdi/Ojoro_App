/**
 * Check-in and live location for one game. Location is read in the foreground only: once when you
 * tap CHECK IN (compared by the server and discarded), and while you choose to share for this game.
 * Sharing stops by itself at the game's end + 30 min (server), when you tap STOP SHARING, or when
 * you leave the screen's watch (the share itself lasts until its end time).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useEffect, useEffectEvent, useState } from 'react';
import { Linking, Platform } from 'react-native';

import { track } from '@/lib/analytics';
import { rpc, ojoroErrorOf } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

import { activityKeys, retryNetwork, useIntentKey, useOnline } from '../activities/data';
import { checkInFailure, SHARE_MOVE_M, type CheckInFailure, type LocationProblem } from './logic';

type Position = { lat: number; lng: number };

/** Ask once (foreground) and read one position, or say why we couldn't. */
async function currentPosition(): Promise<Position | LocationProblem> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return 'denied';
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch (error) {
    // Web reports a denied prompt as an error with code 1.
    const code = (error as { code?: unknown } | null)?.code;
    return code === 1 || code === 'E_LOCATION_UNAUTHORIZED' ? 'denied' : 'unavailable';
  }
}

/** OPEN SETTINGS where the platform has it; on web, asking again is the only step. */
export function openLocationSettings() {
  if (Platform.OS === 'web') return;
  void Linking.openSettings().catch(() => undefined);
}

export function useCheckIn(activityId: string, radiusM: number, timeZone: string, opensAt: string) {
  const queryClient = useQueryClient();
  const online = useOnline();
  const intent = useIntentKey();
  const [failure, setFailure] = useState<CheckInFailure | null>(null);
  const [locating, setLocating] = useState(false);
  const mutation = useMutation({
    mutationFn: (v: { key: string; lat: number; lng: number }) =>
      rpc('check_in', {
        p_activity_id: activityId,
        p_lat: v.lat,
        p_lng: v.lng,
        p_idempotency_key: v.key,
      }),
    retry: retryNetwork,
  });

  async function checkIn(): Promise<boolean> {
    setFailure(null);
    track('check_in_tapped', { activity_id: activityId });
    if (Date.now() < Date.parse(opensAt)) {
      // Not open yet: say when, without asking for location.
      setFailure(checkInFailure({ kind: 'ojoro', code: 'check_in_not_open', detail: opensAt }, radiusM, timeZone));
      return false;
    }
    if (!online) {
      setFailure(checkInFailure('offline', radiusM, timeZone));
      track('check_in_failed', { activity_id: activityId, code: 'offline' });
      return false;
    }
    setLocating(true);
    const pos = await currentPosition();
    setLocating(false);
    if (typeof pos === 'string') {
      const f = checkInFailure(pos, radiusM, timeZone);
      setFailure(Platform.OS === 'web' && f.action === 'OPEN SETTINGS' ? { ...f, action: 'TRY AGAIN' } : f);
      track('check_in_failed', { activity_id: activityId, code: `location_${pos}` });
      return false;
    }
    try {
      const state = await mutation.mutateAsync({ key: intent.key(), ...pos });
      intent.settle(null);
      track('checked_in', { activity_id: activityId, method: 'location', changed: !!state.changed });
      await queryClient.invalidateQueries({ queryKey: activityKeys.all(activityId) });
      return true;
    } catch (error) {
      intent.settle(error);
      const e = ojoroErrorOf(error);
      setFailure(checkInFailure(e, radiusM, timeZone));
      track('check_in_failed', { activity_id: activityId, code: e.code });
      return false;
    }
  }

  return {
    checkIn,
    pending: locating || mutation.isPending,
    failure,
    clearFailure: () => setFailure(null),
  };
}

/** The host confirms someone is here (attendance rule "Host confirms"). */
export function useHostCheckIn(activityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => rpc('host_check_in', { p_activity_id: activityId, p_user_id: userId }),
    retry: retryNetwork,
    onSuccess: () => {
      track('host_checked_in', { activity_id: activityId });
      return queryClient.invalidateQueries({ queryKey: activityKeys.all(activityId) });
    },
  });
}

export type MyShare = { expires_at: string } | null;

function metresBetween(a: Position, b: Position): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const x = rad(b.lng - a.lng) * Math.cos(rad((a.lat + b.lat) / 2));
  const y = rad(b.lat - a.lat);
  return Math.sqrt(x * x + y * y) * 6_371_000;
}

/** Your live location for this game: read, start, stop, and keep it current while on screen. */
export function useLocationShare(activityId: string, userId: string, active: boolean) {
  const queryClient = useQueryClient();
  const online = useOnline();
  const key = [...activityKeys.all(activityId), 'share', userId] as const;
  const [problem, setProblem] = useState<string | null>(null);

  const share = useQuery({
    queryKey: key,
    queryFn: async (): Promise<MyShare> => {
      const { data, error } = await supabase
        .from('location_shares')
        .select('expires_at')
        .eq('activity_id', activityId)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: active,
    retry: retryNetwork,
  });

  // RLS hides expired rows; between refetches, drop it locally at its end time.
  const expiresAt = share.data?.expires_at ?? null;
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    setExpired(false);
    if (!expiresAt) return;
    const ms = Date.parse(expiresAt) - Date.now();
    if (ms <= 0) {
      setExpired(true);
      return;
    }
    const t = setTimeout(() => setExpired(true), Math.min(ms, 2_147_000_000));
    return () => clearTimeout(t);
  }, [expiresAt]);
  const mine: MyShare = expiresAt && !expired ? { expires_at: expiresAt } : null;

  const start = useMutation({
    mutationFn: (p: Position) => rpc('share_location', { p_activity_id: activityId, p_lat: p.lat, p_lng: p.lng }),
    retry: retryNetwork,
    onSuccess: (state) => {
      track('location_sharing_started', { activity_id: activityId });
      queryClient.setQueryData(key, state.expires_at ? { expires_at: state.expires_at } : null);
    },
  });
  const stop = useMutation({
    mutationFn: () => rpc('stop_sharing_location', { p_activity_id: activityId }),
    retry: retryNetwork,
    onSuccess: () => {
      track('location_sharing_stopped', { activity_id: activityId });
      queryClient.setQueryData(key, null);
    },
  });

  async function startSharing() {
    setProblem(null);
    if (!online) {
      setProblem("You're offline. Share your location when you're back online.");
      return;
    }
    const pos = await currentPosition();
    if (typeof pos === 'string') {
      setProblem(
        pos === 'denied'
          ? 'Sharing needs your location. Turn on location for Ojoro to share it with this game only.'
          : "We couldn't find where you are. Try again in a moment.",
      );
      return;
    }
    start.mutate(pos, {
      onError: (e) => {
        const code = ojoroErrorOf(e).code;
        setProblem(
          code === 'share_not_allowed'
            ? 'Location sharing opens an hour before check-in and ends 30 minutes after the game.'
            : "Sharing didn't start. Try again.",
        );
      },
    });
  }

  function stopSharing() {
    setProblem(null);
    stop.mutate(undefined, {
      onError: () => setProblem("Sharing didn't stop. Try again; it still ends by itself."),
    });
  }

  // While sharing and on this screen, move the share when you move 50 m (never extends its end).
  const sendMove = useEffectEvent((p: Position) => {
    void rpc('share_location', { p_activity_id: activityId, p_lat: p.lat, p_lng: p.lng }).catch((e: unknown) => {
      if (ojoroErrorOf(e).code === 'share_not_allowed') void queryClient.invalidateQueries({ queryKey: key });
    });
  });
  const sharing = !!mine;
  useEffect(() => {
    if (!sharing || !active) return;
    let sub: Location.LocationSubscription | null = null;
    let last: Position | null = null;
    let cancelled = false;
    void Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, distanceInterval: SHARE_MOVE_M, timeInterval: 60_000 },
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (last && metresBetween(last, p) < SHARE_MOVE_M) return;
        last = p;
        sendMove(p);
      },
    )
      .then((s) => {
        if (cancelled) s.remove();
        else sub = s;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [sharing, active]);

  return {
    mine,
    loading: share.isPending && active,
    startSharing,
    stopSharing,
    busy: start.isPending || stop.isPending,
    problem,
  };
}
