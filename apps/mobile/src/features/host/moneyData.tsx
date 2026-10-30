/**
 * Reads and writes for HostPeople, HostAnnounce and HostMembership (SCR-HOST-B). Contracts:
 * docs/HOSTS_CONTRACT.md (People, Announce) and docs/HOSTS_OPS_CONTRACT.md (money). Every key starts
 * with `hostKeys.all(programId)`, so the program realtime hint held by the route layout refreshes
 * them all; the money ledger has its own hint (`hostMoneySubscription`).
 *
 * NO MONEY MOVES: there is no payments provider yet. Refund decisions are recorded and authorized on
 * the server; the service fee is a placeholder computed there, never here.
 *
 * Keyed writes (send_announcement, decide_host_refund, create_host_pass) carry one idempotency key
 * per intention (useIntentKey), reused on retry. The rest are set-to-state and safe to repeat.
 */
import {
  hostMoneySubscription,
  type AnnounceContext,
  type AnnounceTemplate,
  type AnnouncementHistoryRow,
  type HostAudience,
  type HostDecisionState,
  type HostMoneyView,
  type HostPassKind,
  type HostPeopleCounts,
  type HostPeopleFilter,
  type HostPerson,
  type HostPersonRow,
} from '@ojoro/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { track } from '@/lib/analytics';
import { useRealtimeRefetch } from '@/lib/realtime';
import { rpc } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

import { useIntentKey } from '../activities/data';
import { hostKeys, retryNetwork } from './data';

export const peopleKeys = {
  all: (programId: string) => [...hostKeys.all(programId), 'people'] as const,
  counts: (programId: string) => [...hostKeys.all(programId), 'people', 'counts'] as const,
  list: (programId: string, filter: HostPeopleFilter, query: string) =>
    [...hostKeys.all(programId), 'people', 'list', filter, query] as const,
  person: (programId: string, userId: string) => [...hostKeys.all(programId), 'people', 'person', userId] as const,
};

export const announceKeys = {
  context: (programId: string, sessionId: string) => [...hostKeys.all(programId), 'announce', sessionId] as const,
  count: (programId: string, sessionId: string, audiences: readonly HostAudience[]) =>
    [...hostKeys.all(programId), 'announce', sessionId, 'count', audiences.join(',')] as const,
  templates: (programId: string, sessionId: string) =>
    [...hostKeys.all(programId), 'announce', sessionId, 'templates'] as const,
  history: (programId: string) => [...hostKeys.all(programId), 'announce-history'] as const,
};

export const moneyKeys = {
  view: (programId: string) => [...hostKeys.all(programId), 'money'] as const,
};

/** The program's crew (for the crew chat link), read through RLS. Null when it has none. */
export function useProgramCrew(programId: string) {
  return useQuery({
    queryKey: [...hostKeys.all(programId), 'crew'] as const,
    queryFn: async () => {
      const { data, error } = await supabase.from('host_programs').select('crew_id').eq('id', programId).maybeSingle();
      if (error) throw error;
      return (data?.crew_id as string | null | undefined) ?? null;
    },
    retry: retryNetwork,
    enabled: !!programId,
    staleTime: 5 * 60_000,
  });
}

// People -----------------------------------------------------------------------------------------

export function usePeopleCounts(programId: string) {
  return useQuery({
    queryKey: peopleKeys.counts(programId),
    queryFn: async () =>
      ((await rpc('host_people_counts', { p_program_id: programId }))[0] ?? null) as HostPeopleCounts | null,
    retry: retryNetwork,
    enabled: !!programId,
  });
}

export function usePeople(programId: string, filter: HostPeopleFilter, query: string, enabled = true) {
  const q = query.trim();
  return useQuery({
    queryKey: peopleKeys.list(programId, filter, q),
    queryFn: async () =>
      (await rpc('host_people', {
        p_program_id: programId,
        p_filter: filter,
        ...(q ? { p_query: q } : null),
      })) as unknown as HostPersonRow[],
    retry: retryNetwork,
    enabled: enabled && !!programId,
    placeholderData: keepPreviousData,
  });
}

export function usePerson(programId: string, userId: string | null) {
  return useQuery({
    queryKey: peopleKeys.person(programId, userId ?? ''),
    queryFn: async () =>
      ((await rpc('host_person', { p_program_id: programId, p_user_id: userId! }))[0] ?? null) as HostPerson | null,
    retry: retryNetwork,
    enabled: !!programId && !!userId,
  });
}

/** Tags: set-to-state, shown at once and rolled back on an error. */
export function useSetTags(programId: string, userId: string) {
  const qc = useQueryClient();
  const key = peopleKeys.person(programId, userId);
  return useMutation({
    mutationFn: (tags: string[]) => rpc('set_person_tags', { p_program_id: programId, p_user_id: userId, p_tags: tags }),
    retry: retryNetwork,
    onMutate: async (tags) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<HostPerson | null>(key);
      qc.setQueryData<HostPerson | null>(key, (p) => (p ? { ...p, tags } : p));
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous !== undefined) qc.setQueryData(key, ctx.previous);
    },
    onSuccess: (tags) => qc.setQueryData<HostPerson | null>(key, (p) => (p ? { ...p, tags } : p)),
    onSettled: () => void qc.invalidateQueries({ queryKey: peopleKeys.all(programId) }),
  });
}

/** The private note: set-to-state (empty clears). Only the author ever reads it back. */
export function useSetNote(programId: string, userId: string) {
  const qc = useQueryClient();
  const key = peopleKeys.person(programId, userId);
  return useMutation({
    mutationFn: (body: string) => rpc('set_person_note', { p_program_id: programId, p_user_id: userId, p_body: body }),
    retry: retryNetwork,
    onSuccess: (_d, body) => qc.setQueryData<HostPerson | null>(key, (p) => (p ? { ...p, my_note: body || null } : p)),
  });
}

/** INVITE THEM BACK (all drifting) or INVITE TO… (one person): once a week per person, server-side. */
export function useInviteBack(programId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { sessionId: string; userIds?: string[] }) =>
      ((await rpc('invite_back', {
        p_program_id: programId,
        p_session_id: v.sessionId,
        ...(v.userIds ? { p_user_ids: v.userIds } : null),
      }))[0] ?? { sent: 0, skipped: 0 }) as { sent: number; skipped: number },
    retry: retryNetwork,
    onMutate: (v) =>
      track('cta_tapped', { cta: v.userIds ? 'host_invite_to' : 'host_invite_back', program_id: programId }),
    onSettled: () => void qc.invalidateQueries({ queryKey: peopleKeys.all(programId) }),
  });
}

// Announce ---------------------------------------------------------------------------------------

export function useAnnounceContext(programId: string, sessionId: string | null) {
  return useQuery({
    queryKey: announceKeys.context(programId, sessionId ?? ''),
    queryFn: async () =>
      ((await rpc('announce_context', { p_session_id: sessionId! }))[0] ?? null) as AnnounceContext | null,
    retry: retryNetwork,
    enabled: !!sessionId,
  });
}

/** SEND TO 17: the server's count for the picked groups (people in two groups count once). */
export function useRecipientCount(programId: string, sessionId: string | null, audiences: readonly HostAudience[]) {
  return useQuery({
    queryKey: announceKeys.count(programId, sessionId ?? '', audiences),
    queryFn: async () => rpc('announce_recipient_count', { p_session_id: sessionId!, p_audiences: [...audiences] }),
    retry: retryNetwork,
    enabled: !!sessionId && audiences.length > 0,
    placeholderData: keepPreviousData,
  });
}

export function useAnnounceTemplates(programId: string, sessionId: string | null) {
  return useQuery({
    queryKey: announceKeys.templates(programId, sessionId ?? ''),
    queryFn: async () => (await rpc('announce_templates', { p_session_id: sessionId! })) as AnnounceTemplate[],
    retry: retryNetwork,
    enabled: !!sessionId,
    staleTime: 10 * 60_000,
  });
}

export function useAnnouncementHistory(programId: string) {
  return useQuery({
    queryKey: announceKeys.history(programId),
    queryFn: async () =>
      (await rpc('host_announcement_history', { p_program_id: programId, p_limit: 20 })) as unknown as AnnouncementHistoryRow[],
    retry: retryNetwork,
    enabled: !!programId,
  });
}

export type AnnouncementDraft = {
  audiences: HostAudience[];
  body: string;
  template: string | null;
  pin: boolean;
  notify: boolean;
};

/** SEND TO n: one key per message, reused if the connection drops, so it's never sent twice. */
export function useSendAnnouncement(programId: string, sessionId: string) {
  const qc = useQueryClient();
  const intent = useIntentKey();
  return {
    intent,
    ...useMutation({
      mutationFn: (d: AnnouncementDraft) =>
        rpc('send_announcement', {
          p_session_id: sessionId,
          p_audiences: d.audiences,
          p_body: d.body,
          ...(d.template ? { p_template: d.template } : null),
          p_pin: d.pin,
          p_notify: d.notify,
          p_idempotency_key: intent.key(),
        }),
      retry: retryNetwork,
      onMutate: (d) =>
        track('cta_tapped', {
          cta: 'host_announcement_send',
          program_id: programId,
          audiences: d.audiences.join(','),
          pinned: d.pin,
          notified: d.notify,
          template: d.template,
        }),
      onSettled: (_d, error) => {
        intent.settle(error);
        void qc.invalidateQueries({ queryKey: announceKeys.history(programId) });
        void qc.invalidateQueries({ queryKey: announceKeys.context(programId, sessionId) });
      },
    }),
  };
}

// Money ------------------------------------------------------------------------------------------

export function useMoneyView(programId: string) {
  useRealtimeRefetch(programId ? hostMoneySubscription(programId) : null, [moneyKeys.view(programId)]);
  return useQuery({
    queryKey: moneyKeys.view(programId),
    queryFn: async () => (await rpc('host_money_view', { p_program_id: programId })) as unknown as HostMoneyView,
    retry: retryNetwork,
    enabled: !!programId,
  });
}

function useMoneyRefresh(programId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: moneyKeys.view(programId) });
    void qc.invalidateQueries({ queryKey: hostKeys.needsYou(programId) });
    void qc.invalidateQueries({ queryKey: hostKeys.program(programId) });
    void qc.invalidateQueries({ queryKey: peopleKeys.all(programId) });
  };
}

/** REFUND ALL / REFUND $25 / KEEP IT. Recorded and authorized on the server; nothing moves money. */
export function useDecideRefund(programId: string) {
  const intent = useIntentKey();
  const refresh = useMoneyRefresh(programId);
  return useMutation({
    mutationFn: async (v: { requestId: string; decision: 'full' | 'partial' | 'keep'; amountCents?: number }) =>
      (await rpc('decide_host_refund', {
        p_request_id: v.requestId,
        p_decision: v.decision,
        p_idempotency_key: intent.key(),
        ...(v.decision === 'partial' && v.amountCents != null ? { p_amount_cents: v.amountCents } : null),
      })) as unknown as HostDecisionState,
    retry: retryNetwork,
    onMutate: (v) => track('cta_tapped', { cta: `host_refund_${v.decision}`, program_id: programId }),
    onSettled: (_d, error) => {
      intent.settle(error);
      refresh();
    },
  });
}

/** UNDO a refund decision while its refund is still pending (10 minutes). */
export function useUndoRefund(programId: string) {
  const refresh = useMoneyRefresh(programId);
  return useMutation({
    mutationFn: async (requestId: string) =>
      (await rpc('undo_host_refund_decision', { p_request_id: requestId })) as unknown as HostDecisionState,
    retry: retryNetwork,
    onSettled: refresh,
  });
}

export type PassDraft = {
  kind: HostPassKind;
  name: string;
  description: string;
  priceCents: number;
  sessionsIncluded: number | null;
  validDays: number | null;
};

/** NEW PASS (keyed) and EDIT (set-to-state). Changing a price applies to the next sale only. */
export function useSavePass(programId: string) {
  const intent = useIntentKey();
  const refresh = useMoneyRefresh(programId);
  return useMutation({
    mutationFn: async (v: { passId: string | null; draft: PassDraft; currency: string }) => {
      const d = v.draft;
      const optional = {
        ...(d.description.trim() ? { p_description: d.description.trim() } : null),
        ...(d.sessionsIncluded != null ? { p_sessions_included: d.sessionsIncluded } : null),
        ...(d.validDays != null ? { p_valid_days: d.validDays } : null),
      };
      if (v.passId) {
        await rpc('update_host_pass', {
          p_pass_id: v.passId,
          p_name: d.name.trim(),
          p_price_cents: d.priceCents,
          ...optional,
        });
        return v.passId;
      }
      return rpc('create_host_pass', {
        p_program_id: programId,
        p_kind: d.kind,
        p_name: d.name.trim(),
        p_price_cents: d.priceCents,
        p_currency: v.currency,
        p_idempotency_key: intent.key(),
        ...optional,
      });
    },
    retry: retryNetwork,
    onMutate: (v) => track('cta_tapped', { cta: v.passId ? 'host_pass_edit' : 'host_pass_new', program_id: programId }),
    onSettled: (_d, error) => {
      intent.settle(error);
      refresh();
    },
  });
}

/** Stop selling a pass. People who hold one keep it. */
export function useArchivePass(programId: string) {
  const refresh = useMoneyRefresh(programId);
  return useMutation({
    mutationFn: (passId: string) => rpc('archive_host_pass', { p_pass_id: passId }),
    retry: retryNetwork,
    onSettled: refresh,
  });
}
