/**
 * Reads and writes for the participant payment flow (docs/PAYMENTS_CONTRACT.md): what I can buy from
 * a program or session, starting a Stripe Checkout, the checkout I came back from, and my passes and
 * receipts. Stripe's hosted pages are opened with expo-linking; no Stripe SDK, no card fields.
 *
 * The client never sends a price: it sends what it wants (a pass or a session) and one idempotency
 * key per buying intention, reused on retry so a dropped connection never makes two checkouts.
 * A checkout is paid only when the webhook says so; the return screen listens and polls.
 */
import {
  isCheckoutPending,
  paymentCheckoutSubscription,
  paymentsFunctionError,
  paymentsFunctions,
  toOjoroError,
  type HostPurchaseOptions,
  type PaymentCheckoutKind,
  type PaymentCheckoutStarted,
  type PaymentCheckoutState,
  type PaymentCheckoutStatus,
  type StartCheckoutRequest,
} from '@ojoro/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import { track } from '@/lib/analytics';
import { useRealtimeRefetch } from '@/lib/realtime';
import { OjoroCallError, rpc } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

import { retryNetwork, useIntentKey } from '../activities/data';
import { returnBase } from './logic';

export const payKeys = {
  all: ['pay'] as const,
  options: (programId: string, sessionId: string | null) => ['pay', 'options', programId, sessionId] as const,
  sessionOf: (activityId: string) => ['pay', 'session-of', activityId] as const,
  checkout: (id: string) => ['pay', 'checkout', id] as const,
  mine: (userId: string) => ['pay', 'mine', userId] as const,
};

/** Calls a payments edge function; errors come back PostgREST-shaped and map to the usual codes. */
export async function invokePayments<T>(name: string, body: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const named = (error as { name?: string }).name;
    if (named === 'FunctionsFetchError') {
      throw new OjoroCallError({ kind: 'network', code: 'network', detail: (error as Error).message });
    }
    let parsed = null;
    const ctx = (error as { context?: unknown }).context;
    if (ctx && typeof (ctx as Response).json === 'function') {
      try {
        parsed = paymentsFunctionError(await (ctx as Response).clone().json());
      } catch {
        // Not JSON: fall through to the generic error.
      }
    }
    throw new OjoroCallError(toOjoroError(parsed ?? error));
  }
  const inBody = paymentsFunctionError(data);
  if (inBody) throw new OjoroCallError(toOjoroError(inBody));
  return data as T;
}

/** Opens a Stripe hosted page. Web stays in the tab (Stripe sends it back here); native hands off. */
export async function openHosted(url: string): Promise<void> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.assign(url);
    return;
  }
  await Linking.openURL(url);
}

function appReturnBase(): string | undefined {
  return returnBase(Platform.OS, Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : null);
}

/** The host session behind an activity (null for an ordinary game). Read through RLS. */
export function useHostSessionOf(activityId: string) {
  return useQuery({
    queryKey: payKeys.sessionOf(activityId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('host_sessions')
        .select('id, program_id')
        .eq('activity_id', activityId)
        .maybeSingle();
      if (error) throw new OjoroCallError(toOjoroError(error));
      return data ? { sessionId: data.id as string, programId: data.program_id as string } : null;
    },
    retry: retryNetwork,
    enabled: !!activityId,
    staleTime: 10 * 60_000,
  });
}

/** What I can buy from a program, and (with a session) how my spot there is paid. */
export function usePurchaseOptions(programId: string | null | undefined, sessionId: string | null = null) {
  return useQuery({
    queryKey: payKeys.options(programId ?? '', sessionId),
    queryFn: async () =>
      (await rpc('host_purchase_options', {
        p_program_id: programId!,
        ...(sessionId ? { p_session_id: sessionId } : null),
      })) as unknown as HostPurchaseOptions,
    retry: retryNetwork,
    enabled: !!programId,
  });
}

export type CheckoutTarget = { passId: string; sessionId?: never } | { sessionId: string; passId?: never };

/**
 * PAY $8 / PAY $70: one key per buying intention. The server computes the amount; we open the page
 * it made. Retrying with the same key returns the same page.
 */
export function useStartCheckout(programId: string) {
  const qc = useQueryClient();
  const intent = useIntentKey();
  return useMutation({
    mutationFn: async (target: CheckoutTarget) => {
      const back = appReturnBase();
      const body: StartCheckoutRequest = {
        ...('passId' in target && target.passId ? { pass_id: target.passId } : { session_id: target.sessionId! }),
        idempotency_key: intent.key(),
        ...(back ? { return_to: back } : null),
      };
      return invokePayments<PaymentCheckoutStarted>(paymentsFunctions.checkout, body);
    },
    retry: retryNetwork,
    onSuccess: async (started) => {
      track('payment_checkout_opened', { kind: started.kind, program_id: programId, resumed: false });
      await openHosted(started.url);
    },
    onSettled: (_d, error) => {
      intent.settle(error);
      void qc.invalidateQueries({ queryKey: ['pay', 'options', programId] });
    },
  });
}

/** Go back to a checkout page that's still open, instead of starting another. */
export async function resumeCheckout(c: Pick<PaymentCheckoutState, 'url' | 'kind' | 'program_id'>): Promise<void> {
  if (!c.url) return;
  track('payment_checkout_opened', { kind: c.kind, program_id: c.program_id, resumed: true });
  await openHosted(c.url);
}

/**
 * The checkout I came back from. Realtime is the hint; while Stripe hasn't confirmed, poll too
 * (every 2s, then every 5s), because the webhook may land before the channel is up.
 */
export function useCheckoutState(checkoutId: string, userId: string) {
  useRealtimeRefetch(userId ? paymentCheckoutSubscription(userId) : null, [payKeys.checkout(checkoutId)]);
  return useQuery({
    queryKey: payKeys.checkout(checkoutId),
    queryFn: async () =>
      ((await rpc('payment_checkout', { p_checkout_id: checkoutId })) as unknown as PaymentCheckoutState | null) ?? null,
    retry: retryNetwork,
    enabled: !!checkoutId,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      if (!s || !isCheckoutPending(s)) return false;
      return q.state.dataUpdateCount < 15 ? 2_000 : 5_000;
    },
  });
}

export type MyPass = {
  membership_id: string;
  program_id: string;
  program_name: string;
  kind: 'pack' | 'monthly' | 'free';
  pass_name: string;
  status: 'active' | 'cancelled' | 'ended';
  renews: boolean;
  period_ends_at: string | null;
  sessions_left: number | null;
  provider: 'stripe' | 'none';
};

export type MyReceipt = {
  checkout_id: string;
  program_id: string;
  program_name: string;
  kind: PaymentCheckoutKind;
  pass_name: string | null;
  status: PaymentCheckoutStatus;
  amount_cents: number;
  currency: string;
  completed_at: string | null;
  created_at: string;
};

type MembershipRow = {
  id: string;
  program_id: string;
  kind: MyPass['kind'];
  status: MyPass['status'];
  renews: boolean;
  period_ends_at: string | null;
  sessions_total: number | null;
  provider?: string | null;
  host_passes: { name: string } | null;
  host_programs: { name: string } | null;
  host_pass_uses: { count: number }[] | null;
};

type CheckoutRow = {
  id: string;
  program_id: string;
  kind: PaymentCheckoutKind;
  status: PaymentCheckoutStatus;
  amount_cents: number;
  currency: string;
  completed_at: string | null;
  created_at: string;
  host_passes: { name: string } | null;
  host_programs: { name: string } | null;
};

/** My passes (any program) and the payments I made in the app, newest first. Read through RLS. */
export function useMyPayments(userId: string) {
  useRealtimeRefetch(userId ? paymentCheckoutSubscription(userId) : null, [payKeys.mine(userId)]);
  return useQuery({
    queryKey: payKeys.mine(userId),
    queryFn: async () => {
      const [m, c] = await Promise.all([
        supabase
          .from('host_memberships')
          .select(
            'id, program_id, kind, status, renews, period_ends_at, sessions_total, provider, host_passes(name), host_programs(name), host_pass_uses(count)',
          )
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('payment_checkouts')
          .select('id, program_id, kind, status, amount_cents, currency, completed_at, created_at, host_passes(name), host_programs(name)')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(30),
      ]);
      if (m.error) throw new OjoroCallError(toOjoroError(m.error));
      if (c.error) throw new OjoroCallError(toOjoroError(c.error));
      const passes: MyPass[] = ((m.data ?? []) as unknown as MembershipRow[]).map((r) => ({
        membership_id: r.id,
        program_id: r.program_id,
        program_name: r.host_programs?.name ?? 'A program',
        kind: r.kind,
        pass_name: r.host_passes?.name ?? 'Pass',
        status: r.status,
        renews: r.renews,
        period_ends_at: r.period_ends_at,
        sessions_left: r.sessions_total != null ? Math.max(0, r.sessions_total - (r.host_pass_uses?.[0]?.count ?? 0)) : null,
        provider: r.provider === 'stripe' ? 'stripe' : 'none',
      }));
      const receipts: MyReceipt[] = ((c.data ?? []) as unknown as CheckoutRow[]).map((r) => ({
        checkout_id: r.id,
        program_id: r.program_id,
        program_name: r.host_programs?.name ?? 'A program',
        kind: r.kind,
        pass_name: r.host_passes?.name ?? null,
        status: r.status,
        amount_cents: r.amount_cents,
        currency: r.currency,
        completed_at: r.completed_at,
        created_at: r.created_at,
      }));
      return { passes, receipts };
    },
    retry: retryNetwork,
    enabled: !!userId,
  });
}
