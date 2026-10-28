/**
 * Attendance writes on the Activity screen. Each carries the intent's idempotency key, so a retry
 * after a dropped connection (or a queued tap that goes through on reconnect) applies once.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { track } from '@/lib/analytics';
import { rpc } from '@/lib/rpc';

import { activityKeys, retryNetwork } from './data';

export function useCancelAttendance(activityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['activity', activityId, 'cancel'],
    mutationFn: (key: string) => rpc('cancel_attendance', { p_activity_id: activityId, p_idempotency_key: key }),
    retry: retryNetwork,
    onSuccess: (state) => {
      track('attendance_cancelled', {
        activity_id: activityId,
        changed: !!state.changed,
        promoted: !!state.promoted_user_id,
      });
      return queryClient.invalidateQueries({ queryKey: activityKeys.all(activityId) });
    },
  });
}

export function useJoinWaitlist(activityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['activity', activityId, 'waitlist'],
    mutationFn: (key: string) => rpc('join_waitlist', { p_activity_id: activityId, p_idempotency_key: key }),
    retry: retryNetwork,
    onSuccess: (state) => {
      track('waitlist_joined', {
        activity_id: activityId,
        status: state.status ?? null,
        position: state.waitlist_position ?? null,
      });
      return queryClient.invalidateQueries({ queryKey: activityKeys.all(activityId) });
    },
  });
}

/** Host: start the game (from check-in opening) or blow FULL TIME (After starts now). */
export function useHostGameControl(activityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (what: 'start' | 'end') =>
      what === 'start'
        ? rpc('start_activity', { p_activity_id: activityId })
        : rpc('end_activity', { p_activity_id: activityId }),
    retry: retryNetwork,
    onSuccess: (_s, what) => {
      track('cta_tapped', { cta: what === 'start' ? 'start_game' : 'full_time', activity_id: activityId });
      return queryClient.invalidateQueries({ queryKey: activityKeys.all(activityId) });
    },
  });
}
