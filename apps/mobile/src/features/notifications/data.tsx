/**
 * Updates, the bell and Settings → Notifications (docs/MESSAGING_CONTRACT.md: Notifications,
 * Realtime, Screens). Everything sits under ['notifications'] so one realtime hint refreshes the
 * list and the bell together.
 */
import {
  notificationsSubscription,
  type NotificationRow,
  type NotificationType,
  type RpcReturns,
} from '@ojoro/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { newIdempotencyKey } from '@/lib/idempotency';
import { useRealtimeRefetch } from '@/lib/realtime';
import { OjoroCallError, rpc } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

import { checkRows, retryNetwork } from '../plans/data';
import type { InlineAction } from './logic';

export const notificationKeys = {
  all: ['notifications'] as const,
  list: ['notifications', 'list'] as const,
  unread: ['notifications', 'unread'] as const,
  prefs: ['notifications', 'prefs'] as const,
  mutes: ['notifications', 'mutes'] as const,
};

export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: notificationKeys.list,
    enabled,
    queryFn: () => rpc('my_notifications', { p_limit: 50 }),
  });
}

/** The bell. */
export function useUnreadCount(enabled = true) {
  return useQuery({
    queryKey: notificationKeys.unread,
    enabled,
    queryFn: () => rpc('unread_count', {}),
  });
}

/** `notifications:{me}`: new and bundled rows refetch the list and the bell (and Home's needs-you cards). */
export function useNotificationsRealtime(userId: string | null) {
  useRealtimeRefetch(userId ? notificationsSubscription(userId) : null, [notificationKeys.all, ['home', 'feed']]);
}

/** Opening Updates: everything up to the newest row rendered becomes read. Safe to repeat. */
export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    retry: retryNetwork,
    mutationFn: (before: string) => rpc('mark_notifications_read', { p_before: before }),
    onSuccess: (changed) => {
      if (changed > 0) qc.setQueryData(notificationKeys.unread, 0);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: notificationKeys.unread });
    },
  });
}

/** Marks a row acted and read (after its action succeeded). Idempotent. */
export function useActOnNotification() {
  const qc = useQueryClient();
  return useMutation({
    retry: retryNetwork,
    mutationFn: (id: string) => rpc('act_on_notification', { p_id: id }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: notificationKeys.all });
      void qc.invalidateQueries({ queryKey: ['home', 'feed'] });
    },
  });
}

/** The current result proposal of a game, to confirm it from a row. */
async function currentProposalId(activityId: string): Promise<string> {
  const rows = checkRows(
    await supabase
      .from('result_proposals')
      .select('id, status, created_at')
      .eq('activity_id', activityId)
      .eq('status', 'proposed')
      .order('created_at', { ascending: false })
      .limit(1),
  );
  const first = rows[0];
  if (!first) throw new OjoroCallError({ kind: 'ojoro', code: 'notification_not_found', detail: null });
  return first.id;
}

export type RowActionInput = {
  id: string;
  action: Extract<InlineAction, { kind: 'rpc' }>['action'];
  planId: string | null;
  activityId: string | null;
  /** One key per tap, reused on every retry (and when a paused mutation resumes online). */
  key: string;
};

/**
 * An inline action on an Updates row or a Home needs-you card: the existing RPC with an
 * idempotency key (I'M DOWN → `im_down`, CONFIRM → `confirm_result`), then `act_on_notification`.
 * `tap()` ignores a second tap on the same row while the first is in flight. Offline, the
 * mutation pauses and resumes on reconnect with the same key (`isPaused`).
 */
export function useRowAction() {
  const qc = useQueryClient();
  const busy = useRef(new Set<string>());
  const mutation = useMutation({
    mutationKey: ['notifications', 'act'],
    retry: retryNetwork,
    mutationFn: async (v: RowActionInput) => {
      if (v.action === 'im_down') {
        await rpc('im_down', { p_plan_id: v.planId ?? '', p_idempotency_key: v.key });
      } else {
        const proposalId = await currentProposalId(v.activityId ?? '');
        await rpc('confirm_result', { p_proposal_id: proposalId, p_idempotency_key: v.key });
      }
      return rpc('act_on_notification', { p_id: v.id });
    },
    onSettled: (_d, _e, v) => {
      void qc.invalidateQueries({ queryKey: notificationKeys.all });
      void qc.invalidateQueries({ queryKey: ['home'] });
      if (v.planId) void qc.invalidateQueries({ queryKey: ['plan', v.planId] });
      if (v.activityId) void qc.invalidateQueries({ queryKey: ['activity', v.activityId] });
    },
  });
  const tap = (input: Omit<RowActionInput, 'key'>, options?: Parameters<typeof mutation.mutate>[1]) => {
    if (busy.current.has(input.id)) return false;
    busy.current.add(input.id);
    mutation.mutate(
      { ...input, key: newIdempotencyKey() },
      {
        ...options,
        onSettled: (...args) => {
          busy.current.delete(input.id);
          options?.onSettled?.(...args);
        },
      },
    );
    return true;
  };
  return { ...mutation, tap, isBusy: (id: string) => busy.current.has(id) };
}

/* ---------- Settings ---------- */

export function useNotificationPrefs() {
  return useQuery({
    queryKey: notificationKeys.prefs,
    queryFn: () => rpc('notification_preferences', {}),
  });
}

type Prefs = RpcReturns<'notification_preferences'>;

export type PrefsChange = {
  p_quiet_hours_enabled?: boolean;
  p_quiet_start?: string;
  p_quiet_end?: string;
  p_show_details?: boolean;
};

/** Quiet hours and lock-screen details. Optimistic; rolls back on an error. */
export function useSetPrefs() {
  const qc = useQueryClient();
  return useMutation({
    retry: retryNetwork,
    mutationFn: (change: PrefsChange) => rpc('set_notification_preferences', change),
    onMutate: async (change) => {
      await qc.cancelQueries({ queryKey: notificationKeys.prefs });
      const previous = qc.getQueryData<Prefs>(notificationKeys.prefs);
      if (previous) {
        qc.setQueryData<Prefs>(notificationKeys.prefs, {
          ...previous,
          ...(change.p_quiet_hours_enabled !== undefined ? { quiet_hours_enabled: change.p_quiet_hours_enabled } : null),
          ...(change.p_quiet_start !== undefined ? { quiet_start: change.p_quiet_start } : null),
          ...(change.p_quiet_end !== undefined ? { quiet_end: change.p_quiet_end } : null),
          ...(change.p_show_details !== undefined ? { show_details: change.p_show_details } : null),
        });
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(notificationKeys.prefs, ctx.previous);
    },
    onSuccess: (state) => qc.setQueryData(notificationKeys.prefs, state),
  });
}

/** Push on/off for one type. Optimistic; rolls back on an error. */
export function useSetType() {
  const qc = useQueryClient();
  return useMutation({
    retry: retryNetwork,
    mutationFn: (v: { type: NotificationType; push: boolean }) =>
      rpc('set_notification_type', { p_type: v.type, p_push: v.push }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: notificationKeys.prefs });
      const previous = qc.getQueryData<Prefs>(notificationKeys.prefs);
      if (previous) {
        const off = new Set(previous.push_off ?? []);
        if (v.push) off.delete(v.type);
        else off.add(v.type);
        qc.setQueryData<Prefs>(notificationKeys.prefs, { ...previous, push_off: [...off] });
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(notificationKeys.prefs, ctx.previous);
    },
    onSuccess: (state) => qc.setQueryData(notificationKeys.prefs, state),
  });
}

export type MutedObject = {
  object_kind: 'plan' | 'activity' | 'crew' | 'challenge' | 'challenge_event' | 'clan';
  object_id: string;
  until: string | null;
  name: string | null;
};

/** Your mutes (own rows, RLS), named from the objects you can still see. */
export function useMutes(userId: string | null) {
  return useQuery({
    queryKey: [...notificationKeys.mutes, userId],
    enabled: userId !== null,
    queryFn: async (): Promise<MutedObject[]> => {
      const rows = checkRows(
        await supabase
          .from('notification_mutes')
          .select('object_kind, object_id, until')
          .eq('user_id', userId ?? '')
          .order('created_at', { ascending: false }),
      );
      const now = Date.now();
      const live = rows.filter((r) => !r.until || Date.parse(r.until) > now);
      const ids = (kind: string) => live.filter((r) => r.object_kind === kind).map((r) => r.object_id);
      const [plans, games, crews, clans] = await Promise.all([
        ids('plan').length
          ? supabase.from('plan_cards').select('id, title, sport_name').in('id', ids('plan'))
          : Promise.resolve({ data: [], error: null }),
        ids('activity').length
          ? supabase.from('activity_cards').select('id, title, sport_name').in('id', ids('activity'))
          : Promise.resolve({ data: [], error: null }),
        ids('crew').length
          ? supabase.from('crews').select('id, name').in('id', ids('crew'))
          : Promise.resolve({ data: [], error: null }),
        ids('clan').length
          ? supabase.from('clans').select('id, name').in('id', ids('clan'))
          : Promise.resolve({ data: [], error: null }),
      ]);
      const names = new Map<string, string>();
      for (const p of checkRows(plans as { data: { id: string | null; title: string | null; sport_name: string | null }[] | null; error: unknown }))
        if (p.id) names.set(p.id, p.title ?? p.sport_name ?? '');
      for (const g of checkRows(games as { data: { id: string | null; title: string | null; sport_name: string | null }[] | null; error: unknown }))
        if (g.id) names.set(g.id, g.title ?? g.sport_name ?? '');
      for (const c of checkRows(crews as { data: { id: string; name: string }[] | null; error: unknown })) names.set(c.id, c.name);
      for (const c of checkRows(clans as { data: { id: string; name: string }[] | null; error: unknown })) names.set(c.id, c.name);
      return live.map((r) => ({
        object_kind: r.object_kind,
        object_id: r.object_id,
        until: r.until,
        name: names.get(r.object_id) || null,
      }));
    },
  });
}

export function useUnmute() {
  const qc = useQueryClient();
  return useMutation({
    retry: retryNetwork,
    mutationFn: (m: Pick<MutedObject, 'object_kind' | 'object_id'>) =>
      rpc('unmute_object', { p_object_kind: m.object_kind, p_object_id: m.object_id }),
    onSettled: () => qc.invalidateQueries({ queryKey: notificationKeys.mutes }),
  });
}

export type { NotificationRow };
