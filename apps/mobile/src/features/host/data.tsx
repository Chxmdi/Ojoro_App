/**
 * Shared Host OS reads (docs/HOSTS_CONTRACT.md). Every query key for one program starts with
 * `['host', programId]` (`hostKeys.all`), so the program realtime hint refetches HostHome, People,
 * Payments, Announce, Season and Insights together. Screen data hooks for one program MUST build
 * their keys from `hostKeys.all(programId)` (spread it first) to be refreshed by it.
 *
 * Owners: SCR-HOST-A (this file). HostPeople/HostMembership/HostAnnounce (SCR-HOST-B) and
 * HostSeason/HostInsights (SCR-HOST-C) import `hostKeys`, `useProgram`, `useHostProgramRealtime`,
 * `retryNetwork` and `isHostNotAllowed` from here.
 */
import {
  hostProgramSubscription,
  hostSessionSubscription,
  type HostHome,
  type HostNeedsYouItem,
  type HostWeekItem,
  type JoinRequestRow,
  type MyHostProgram,
  type RosterRow,
  type SeriesSession,
  type SeriesView,
  type SeriesSettings,
  type SessionView,
} from '@ojoro/contracts';
import { isRetryable } from '@ojoro/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { newIdempotencyKey } from '@/lib/idempotency';

import { useRealtimeRefetch } from '@/lib/realtime';
import { ojoroErrorOf, rpc } from '@/lib/rpc';

export const hostKeys = {
  /** Prefix of every read about one program. */
  all: (programId: string) => ['host', programId] as const,
  /** `host_home`: the program header (name, area, time zone, your role) and the week's numbers. */
  program: (programId: string) => ['host', programId, 'program'] as const,
  needsYou: (programId: string) => ['host', programId, 'needs-you'] as const,
  week: (programId: string) => ['host', programId, 'week'] as const,
  series: (programId: string, seriesId: string) => ['host', programId, 'series', seriesId] as const,
  seriesSessions: (programId: string, seriesId: string) =>
    ['host', programId, 'series', seriesId, 'sessions'] as const,
  /** Prefix of every read about one session (view, roster, requests). */
  session: (programId: string, sessionId: string) => ['host', programId, 'session', sessionId] as const,
  sessionView: (programId: string, sessionId: string) =>
    ['host', programId, 'session', sessionId, 'view'] as const,
  roster: (programId: string, sessionId: string) =>
    ['host', programId, 'session', sessionId, 'roster'] as const,
  requests: (programId: string, sessionId: string) =>
    ['host', programId, 'session', sessionId, 'requests'] as const,
  /** You → "Crews, clans & hosting". */
  mine: ['host-programs', 'mine'] as const,
};

/** Retry dropped connections twice; never retry a coded answer (not a host, not found…). */
export function retryNetwork(failures: number, error: unknown): boolean {
  return failures < 2 && isRetryable(ojoroErrorOf(error));
}

/**
 * The program isn't yours to run, or isn't there (RLS never says which): show the not-allowed
 * state, never a crash. `host_home` answers `not_program_host` / `program_not_found`.
 */
export function isHostNotAllowed(error: unknown): boolean {
  if (!error) return false;
  const code = ojoroErrorOf(error).code;
  return (
    code === 'not_program_host' ||
    code === 'program_not_found' ||
    code === 'session_not_found' ||
    code === 'series_not_found' ||
    code === 'invalid_argument'
  );
}

/**
 * The program as its hosts see it: `host_home` (name, area, time_zone, role, this week's numbers,
 * last 30 days). Throws `not_program_host` for anyone who doesn't run it. The route layout
 * (`app/host/[programId]/_layout.tsx`) already gates every host screen on it, so screens under it
 * can read `data` for the header without handling not-allowed themselves.
 */
export function useProgram(programId: string) {
  return useQuery({
    queryKey: hostKeys.program(programId),
    queryFn: async () => ((await rpc('host_home', { p_program_id: programId }))[0] ?? null) as HostHome | null,
    retry: retryNetwork,
    enabled: !!programId,
  });
}

/** Realtime hint for everything about one program: refetches every `['host', programId, …]` read. */
export function useHostProgramRealtime(programId: string) {
  useRealtimeRefetch(programId ? hostProgramSubscription(programId) : null, [hostKeys.all(programId)]);
}

/** Realtime hint for one session (roster, attendance, requests). Needs the activity id from `session_view`. */
export function useHostSessionRealtime(programId: string, sessionId: string, activityId: string | null | undefined) {
  useRealtimeRefetch(
    sessionId && activityId ? hostSessionSubscription(sessionId, activityId) : null,
    [hostKeys.session(programId, sessionId), hostKeys.program(programId), hostKeys.needsYou(programId), hostKeys.week(programId)],
  );
}

export function useMyHostPrograms(enabled = true) {
  return useQuery({
    queryKey: hostKeys.mine,
    queryFn: async () => (await rpc('my_host_programs', {})) as unknown as MyHostProgram[],
    retry: retryNetwork,
    enabled,
  });
}

// HostHome ---------------------------------------------------------------------------------------

export function useNeedsYou(programId: string, enabled = true) {
  return useQuery({
    queryKey: hostKeys.needsYou(programId),
    queryFn: async () => (await rpc('host_needs_you', { p_program_id: programId })) as HostNeedsYouItem[],
    retry: retryNetwork,
    enabled,
  });
}

export function useHostWeek(programId: string, enabled = true) {
  return useQuery({
    queryKey: hostKeys.week(programId),
    queryFn: async () => (await rpc('host_week', { p_program_id: programId })) as HostWeekItem[],
    retry: retryNetwork,
    enabled,
  });
}

// HostSeries -------------------------------------------------------------------------------------

export function useSeriesView(programId: string, seriesId: string) {
  return useQuery({
    queryKey: hostKeys.series(programId, seriesId),
    queryFn: async () => ((await rpc('series_view', { p_series_id: seriesId }))[0] ?? null) as SeriesView | null,
    retry: retryNetwork,
    enabled: !!seriesId,
  });
}

export function useSeriesSessions(programId: string, seriesId: string, enabled = true) {
  return useQuery({
    queryKey: hostKeys.seriesSessions(programId, seriesId),
    queryFn: async () =>
      (await rpc('series_sessions', { p_series_id: seriesId, p_limit: 4 })) as unknown as SeriesSession[],
    retry: retryNetwork,
    enabled: enabled && !!seriesId,
  });
}

// HostRoster / HostRequests ----------------------------------------------------------------------

export function useSessionView(programId: string, sessionId: string) {
  return useQuery({
    queryKey: hostKeys.sessionView(programId, sessionId),
    queryFn: async () => ((await rpc('session_view', { p_session_id: sessionId }))[0] ?? null) as SessionView | null,
    retry: retryNetwork,
    enabled: !!sessionId,
  });
}

export function useSessionRoster(programId: string, sessionId: string, enabled = true) {
  return useQuery({
    queryKey: hostKeys.roster(programId, sessionId),
    queryFn: async () => (await rpc('session_roster', { p_session_id: sessionId })) as unknown as RosterRow[],
    retry: retryNetwork,
    enabled: enabled && !!sessionId,
  });
}

export function useSessionRequests(programId: string, sessionId: string, enabled = true) {
  return useQuery({
    queryKey: hostKeys.requests(programId, sessionId),
    queryFn: async () =>
      (await rpc('session_requests', { p_session_id: sessionId, p_include_decided: true })) as unknown as JoinRequestRow[],
    retry: retryNetwork,
    enabled: enabled && !!sessionId,
  });
}

/** One idempotency key per intention ("promote:<user>"), reused on a retry, cleared on an answer. */
export function useIntentKeys() {
  const keys = useRef(new Map<string, string>());
  return {
    key(intent: string): string {
      let k = keys.current.get(intent);
      if (!k) {
        k = newIdempotencyKey();
        keys.current.set(intent, k);
      }
      return k;
    },
    settle(intent: string, error: unknown): void {
      if (!error || !isRetryable(ojoroErrorOf(error))) keys.current.delete(intent);
    },
  };
}


// Writes -----------------------------------------------------------------------------------------
// Keyed writes take the caller's intention key (useIntentKey) so a retry never acts twice; the
// set-to-state ones are safe to repeat as they are (contract, Rules).

/** SAVE CHANGES: only what changed, against the version that was loaded. */
export function useUpdateSeries(programId: string, seriesId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { changes: SeriesSettings; version: number }) =>
      rpc('update_series', { p_series_id: seriesId, p_changes: v.changes as never, p_expected_version: v.version }),
    retry: retryNetwork,
    onSettled: () => void qc.invalidateQueries({ queryKey: hostKeys.all(programId) }),
  });
}

export function useSkipSession(programId: string, seriesId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { sessionId: string; skip: boolean }) =>
      v.skip
        ? rpc('skip_session', { p_session_id: v.sessionId })
        : rpc('restore_session', { p_session_id: v.sessionId }),
    retry: retryNetwork,
    onMutate: async (v) => {
      const key = hostKeys.seriesSessions(programId, seriesId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<SeriesSession[]>(key);
      qc.setQueryData<SeriesSession[]>(key, (rows) =>
        (rows ?? []).map((r) =>
          r.session_id === v.sessionId ? { ...r, status: v.skip ? 'skipped' : 'scheduled', skip_reason: null } : r,
        ),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(hostKeys.seriesSessions(programId, seriesId), ctx.previous);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: hostKeys.all(programId) }),
  });
}

export function useSaveTemplate(programId: string, seriesId: string) {
  return useMutation({
    mutationFn: (name: string) => rpc('save_series_template', { p_series_id: seriesId, p_name: name }),
    retry: retryNetwork,
    meta: { programId },
  });
}

function useSessionInvalidate(programId: string, sessionId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: hostKeys.session(programId, sessionId) });
    void qc.invalidateQueries({ queryKey: hostKeys.program(programId) });
    void qc.invalidateQueries({ queryKey: hostKeys.needsYou(programId) });
    void qc.invalidateQueries({ queryKey: hostKeys.week(programId) });
  };
}

/** CHECK-IN by any host: marks one person in at the pitch. */
export function useHostCheckIn(programId: string, sessionId: string) {
  const qc = useQueryClient();
  const refresh = useSessionInvalidate(programId, sessionId);
  return useMutation({
    mutationFn: (userId: string) => rpc('host_session_check_in', { p_session_id: sessionId, p_user_id: userId }),
    retry: retryNetwork,
    onMutate: async (userId) => {
      const key = hostKeys.roster(programId, sessionId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<RosterRow[]>(key);
      qc.setQueryData<RosterRow[]>(key, (rows) =>
        (rows ?? []).map((r) => (r.user_id === userId ? { ...r, checked_in_at: new Date().toISOString() } : r)),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(hostKeys.roster(programId, sessionId), ctx.previous);
    },
    onSettled: refresh,
  });
}

/** LET IN from the waitlist: the host chooses (after the cutoff it's the only way in). */
export function usePromote(programId: string, sessionId: string) {
  const refresh = useSessionInvalidate(programId, sessionId);
  return useMutation({
    mutationFn: (v: { userId: string; key: string }) =>
      rpc('promote_from_waitlist', { p_session_id: sessionId, p_user_id: v.userId, p_idempotency_key: v.key }),
    retry: retryNetwork,
    onSettled: refresh,
  });
}

/** REORDER: the whole waitlist, in the new order. */
export function useReorderWaitlist(programId: string, sessionId: string) {
  const refresh = useSessionInvalidate(programId, sessionId);
  return useMutation({
    mutationFn: (userIds: string[]) => rpc('reorder_waitlist', { p_session_id: sessionId, p_user_ids: userIds }),
    retry: retryNetwork,
    onSettled: refresh,
  });
}

/** ADD A 15TH SPOT: before the cutoff the first person waiting takes it at once. */
export function useAddSpot(programId: string, sessionId: string) {
  const refresh = useSessionInvalidate(programId, sessionId);
  return useMutation({
    mutationFn: (key: string) => rpc('add_session_spot', { p_session_id: sessionId, p_idempotency_key: key }),
    retry: retryNetwork,
    onSettled: refresh,
  });
}

/** APPROVE / DECLINE, shown at once (optimistic) and rolled back on an error. */
export function useDecideRequest(programId: string, sessionId: string) {
  const qc = useQueryClient();
  const refresh = useSessionInvalidate(programId, sessionId);
  return useMutation({
    mutationFn: (v: { requestId: string; approve: boolean; key: string }) =>
      rpc('decide_join_request', { p_request_id: v.requestId, p_approve: v.approve, p_idempotency_key: v.key }),
    retry: retryNetwork,
    onMutate: async (v) => {
      const key = hostKeys.requests(programId, sessionId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<JoinRequestRow[]>(key);
      const now = new Date();
      qc.setQueryData<JoinRequestRow[]>(key, (rows) =>
        (rows ?? []).map((r) =>
          r.request_id === v.requestId
            ? {
                ...r,
                status: v.approve ? 'approved' : 'declined',
                approved_via: v.approve ? 'host' : null,
                decided_at: now.toISOString(),
                undo_until: new Date(now.getTime() + 10 * 60_000).toISOString(),
              }
            : r,
        ),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(hostKeys.requests(programId, sessionId), ctx.previous);
    },
    onSettled: refresh,
  });
}

export function useUndoDecision(programId: string, sessionId: string) {
  const qc = useQueryClient();
  const refresh = useSessionInvalidate(programId, sessionId);
  return useMutation({
    mutationFn: (requestId: string) => rpc('undo_join_decision', { p_request_id: requestId }),
    retry: retryNetwork,
    onMutate: async (requestId) => {
      const key = hostKeys.requests(programId, sessionId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<JoinRequestRow[]>(key);
      qc.setQueryData<JoinRequestRow[]>(key, (rows) =>
        (rows ?? []).map((r) =>
          r.request_id === requestId ? { ...r, status: 'pending', approved_via: null, decided_at: null, undo_until: null } : r,
        ),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(hostKeys.requests(programId, sessionId), ctx.previous);
    },
    onSettled: refresh,
  });
}

export type HostRules = { played_with?: boolean; experienced?: boolean; crews?: boolean };

/** LET THESE STRAIGHT IN: program-wide, set-to-state, optimistic on the session header. */
export function useUpdateRules(programId: string, sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rules: HostRules) =>
      rpc('update_host_rules', {
        p_program_id: programId,
        ...(rules.played_with === undefined ? null : { p_played_with: rules.played_with }),
        ...(rules.experienced === undefined ? null : { p_experienced: rules.experienced }),
        ...(rules.crews === undefined ? null : { p_crews: rules.crews }),
      }),
    retry: retryNetwork,
    onMutate: async (rules) => {
      const key = hostKeys.sessionView(programId, sessionId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<SessionView | null>(key);
      qc.setQueryData<SessionView | null>(key, (v) =>
        v
          ? {
              ...v,
              ...(rules.played_with === undefined ? null : { rule_played_with: rules.played_with }),
              ...(rules.experienced === undefined ? null : { rule_experienced: rules.experienced }),
              ...(rules.crews === undefined ? null : { rule_crews: rules.crews }),
            }
          : v,
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous !== undefined) qc.setQueryData(hostKeys.sessionView(programId, sessionId), ctx.previous);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: hostKeys.all(programId) }),
  });
}

/**
 * Mark a "$8 AT FIELD" spot paid (ops ledger, docs/HOSTS_OPS_CONTRACT.md). No money moves: no
 * payments provider is connected; it records what the host collected so it shows in the payout.
 */
export function useMarkPaid(programId: string, sessionId: string) {
  const refresh = useSessionInvalidate(programId, sessionId);
  return useMutation({
    mutationFn: (v: { userId: string; key: string }) =>
      rpc('mark_paid_at_field', { p_session_id: sessionId, p_user_id: v.userId, p_idempotency_key: v.key }),
    retry: retryNetwork,
    onSettled: refresh,
  });
}
