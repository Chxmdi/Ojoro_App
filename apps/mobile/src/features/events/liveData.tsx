/**
 * Reads and writes for the last stages of a Challenge Event (docs/COMPETITION_CONTRACT.md: live,
 * result and verification). Keys live under ['event', id] (data.tsx), so the `challenge:{id}`
 * channel refetches them with the rest.
 *
 * Result submission and confirmation carry one idempotency key per intention and are retried on a
 * dropped connection; progress, corrections and withdrawals are set-to-state, so retries are safe.
 * CHEER THEM ON toggles, so it is never retried blindly. The server decides who may write: only
 * competitors log progress, only captains submit, confirm or ask for a correction.
 */
import type { ChallengeVerification, ReactionWord } from '@ojoro/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { track } from '@/lib/analytics';
import { rpc } from '@/lib/rpc';

import { eventKeys, retryNetwork, type EventData, type EventView } from './data';
import { applyReaction, readCounts } from '../live/logic';

type Nullable<T> = { [K in keyof T]: T[K] | null };
export type Verification = Nullable<Omit<ChallengeVerification, 'event_id' | 'stage' | 'checks'>> &
  Pick<ChallengeVerification, 'event_id' | 'stage' | 'checks'>;

/** The pending (or confirmed) numbers and every check. Competitors and organizers only. */
export function useVerification(eventId: string, enabled = true) {
  return useQuery({
    queryKey: eventKeys.verification(eventId),
    queryFn: async () =>
      ((await rpc('challenge_verification', { p_event_id: eventId }))[0] ?? null) as unknown as Verification | null,
    retry: retryNetwork,
    enabled: enabled && !!eventId,
  });
}

function useSettleAll(eventId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: eventKeys.all(eventId) });
}

/** LOG PROGRESS (competitors, while live). Set-to-state: the same numbers again change nothing. */
export function useLogProgress(eventId: string) {
  const settle = useSettleAll(eventId);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { a: number | null; b: number | null }) =>
      rpc('log_challenge_progress', {
        p_event_id: eventId,
        ...(v.a !== null ? { p_a_value: v.a } : null),
        ...(v.b !== null ? { p_b_value: v.b } : null),
      }),
    retry: retryNetwork,
    onMutate: () => track('cta_tapped', { cta: 'challenge_progress_logged', event_id: eventId }),
    onSuccess: (s) => {
      qc.setQueryData<EventData>(eventKeys.view(eventId), (prev) =>
        prev
          ? {
              ...prev,
              row: {
                ...prev.row,
                a_progress: s.a_progress ?? prev.row.a_progress,
                b_progress: s.b_progress ?? prev.row.b_progress,
                progress_updated_at: s.progress_updated_at ?? prev.row.progress_updated_at,
              },
            }
          : prev,
      );
    },
    onSettled: settle,
  });
}

/** WE'RE DONE · SUBMIT THE RESULT (captains). NOT FINAL: the other captain confirms. */
export function useSubmitResult(eventId: string) {
  const settle = useSettleAll(eventId);
  return useMutation({
    mutationFn: (v: { a: number; b: number; note: string | null; key: string }) =>
      rpc('submit_challenge_result', {
        p_event_id: eventId,
        p_a_value: v.a,
        p_b_value: v.b,
        p_idempotency_key: v.key,
        ...(v.note ? { p_note: v.note } : null),
      }),
    retry: retryNetwork,
    onSuccess: (s) => {
      track('result_proposed', { event_id: eventId, kind: 'challenge' });
      if (s.verified) track('result_verified', { event_id: eventId, kind: 'challenge' });
    },
    onSettled: settle,
  });
}

/** CONFIRM BOTH TIMES (captains). When both have, the result is final. */
export function useConfirmResult(eventId: string) {
  const settle = useSettleAll(eventId);
  return useMutation({
    mutationFn: (v: { submissionId: string; key: string }) =>
      rpc('confirm_challenge_result', { p_submission_id: v.submissionId, p_idempotency_key: v.key }),
    retry: retryNetwork,
    onSuccess: (s) => {
      track('result_confirmed', { event_id: eventId, kind: 'challenge' });
      if (s.verified) track('result_verified', { event_id: eventId, kind: 'challenge' });
    },
    onSettled: settle,
  });
}

/** REQUEST A CORRECTION: pauses the result. Idempotent while open. */
export function useRequestCorrection(eventId: string) {
  const settle = useSettleAll(eventId);
  return useMutation({
    mutationFn: (note: string | null) =>
      rpc('request_challenge_correction', { p_event_id: eventId, ...(note ? { p_note: note } : null) }),
    retry: retryNetwork,
    onSuccess: () => track('cta_tapped', { cta: 'challenge_correction_requested', event_id: eventId }),
    onSettled: settle,
  });
}

/** The requester takes the correction back. Idempotent. */
export function useWithdrawCorrection(eventId: string) {
  const settle = useSettleAll(eventId);
  return useMutation({
    mutationFn: () => rpc('withdraw_challenge_correction', { p_event_id: eventId }),
    retry: retryNetwork,
    onSuccess: () => track('cta_tapped', { cta: 'challenge_correction_withdrawn', event_id: eventId }),
    onSettled: settle,
  });
}

/** CHEER THEM ON: one word per person, the same word again takes it back. Optimistic, no blind retry. */
export function useCheer(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (word: ReactionWord) => rpc('react_challenge', { p_event_id: eventId, p_reaction: word }),
    retry: false,
    onMutate: async (word) => {
      track('reaction_tapped', { event_id: eventId, reaction: word, on: 'challenge' });
      await qc.cancelQueries({ queryKey: eventKeys.view(eventId) });
      const prev = qc.getQueryData<EventData>(eventKeys.view(eventId));
      if (prev) {
        const next = applyReaction({ counts: readCounts(prev.row.reaction_counts), mine: prev.row.my_reaction }, word);
        const optimistic: EventData = {
          ...prev,
          row: { ...prev.row, reaction_counts: next.counts as unknown as EventView['reaction_counts'], my_reaction: next.mine },
        };
        qc.setQueryData<EventData>(eventKeys.view(eventId), optimistic);
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(eventKeys.view(eventId), ctx.prev);
    },
    onSuccess: (s) => {
      qc.setQueryData<EventData>(eventKeys.view(eventId), (prev) =>
        prev ? { ...prev, row: { ...prev.row, reaction_counts: s.reaction_counts, my_reaction: s.my_reaction } } : prev,
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: eventKeys.view(eventId) }),
  });
}

/**
 * RUN IT BACK (captains, after a verified result): a new linked Call-Out with the same rules, or
 * accepting theirs if they asked first. The finished event is never touched.
 */
export function useRunItBack(eventId: string) {
  const settle = useSettleAll(eventId);
  return useMutation({
    mutationFn: (key: string) => rpc('run_it_back_challenge', { p_event_id: eventId, p_idempotency_key: key }),
    retry: retryNetwork,
    onMutate: () => track('run_it_back_tapped', { event_id: eventId, kind: 'challenge' }),
    onSettled: settle,
  });
}
