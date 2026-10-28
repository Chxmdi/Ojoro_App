/**
 * After: the current result proposal, whether you confirmed it, moments (signed URLs) and their
 * tags, and the writes: propose (SUGGEST A FIX), confirm, add a photo, untag, remove.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';

import { track } from '@/lib/analytics';
import { OjoroCallError, rpc } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';
import { toOjoroError } from '@ojoro/contracts';

import { activityKeys, retryNetwork } from '../activities/data';
import { contentType, currentProposal, momentPath, photoExtension, type Proposal } from './logic';

function fail(error: unknown): never {
  throw new OjoroCallError(toOjoroError(error));
}

export function useResult(activityId: string, userId: string) {
  return useQuery({
    queryKey: [...activityKeys.all(activityId), 'result', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('result_proposals')
        .select('*')
        .eq('activity_id', activityId)
        .in('status', ['proposed', 'verified'])
        .order('created_at', { ascending: false });
      if (error) fail(error);
      const proposal = currentProposal((data ?? []) as Proposal[]);
      let iConfirmed = false;
      if (proposal) {
        const mine = await supabase
          .from('result_confirmations')
          .select('proposal_id')
          .eq('proposal_id', proposal.id)
          .eq('user_id', userId)
          .maybeSingle();
        if (mine.error) fail(mine.error);
        iConfirmed = !!mine.data;
      }
      return { proposal, iConfirmed };
    },
    retry: retryNetwork,
  });
}

export type MomentView = {
  id: string;
  path: string;
  url: string | null;
  alt: string;
  caption: string | null;
  authorId: string;
  taggedMe: boolean;
};

/** Signed URLs last an hour; the query refetches well before that. */
const SIGNED_URL_TTL = 60 * 60;

export function useMoments(activityId: string, userId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...activityKeys.all(activityId), 'moments', userId],
    queryFn: async (): Promise<MomentView[]> => {
      const { data, error } = await supabase
        .from('moments')
        .select('id,storage_path,alt_text,caption,author_id,created_at')
        .eq('activity_id', activityId)
        .order('created_at', { ascending: true });
      if (error) fail(error);
      const rows = data ?? [];
      if (rows.length === 0) return [];
      const [tags, urls] = await Promise.all([
        supabase
          .from('moment_tags')
          .select('moment_id')
          .eq('user_id', userId)
          .in(
            'moment_id',
            rows.map((r) => r.id),
          ),
        supabase.storage.from('moments').createSignedUrls(
          rows.map((r) => r.storage_path),
          SIGNED_URL_TTL,
        ),
      ]);
      const tagged = new Set((tags.data ?? []).map((t) => t.moment_id));
      const byPath = new Map((urls.data ?? []).map((u) => [u.path, u.signedUrl]));
      return rows.map((r) => ({
        id: r.id,
        path: r.storage_path,
        url: byPath.get(r.storage_path) ?? null,
        alt: r.alt_text ?? 'A photo from the game',
        caption: r.caption,
        authorId: r.author_id,
        taggedMe: tagged.has(r.id),
      }));
    },
    enabled,
    staleTime: 10 * 60 * 1000,
    retry: retryNetwork,
  });
}

export function useProposeResult(activityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['activity', activityId, 'propose'],
    mutationFn: (v: { key: string; a: number; b: number }) =>
      rpc('propose_result', {
        p_activity_id: activityId,
        p_team_a_score: v.a,
        p_team_b_score: v.b,
        p_idempotency_key: v.key,
      }),
    retry: retryNetwork,
    onSuccess: (state) => {
      track('result_proposed', { activity_id: activityId, status: state.status ?? null });
      return queryClient.invalidateQueries({ queryKey: activityKeys.all(activityId) });
    },
  });
}

export function useConfirmResult(activityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['activity', activityId, 'confirm'],
    mutationFn: (v: { key: string; proposalId: string }) =>
      rpc('confirm_result', { p_proposal_id: v.proposalId, p_idempotency_key: v.key }),
    retry: retryNetwork,
    onSuccess: (state) => {
      track('result_confirmed', {
        activity_id: activityId,
        confirmations: state.confirmations_count ?? null,
        threshold: state.threshold ?? null,
      });
      return queryClient.invalidateQueries({ queryKey: activityKeys.all(activityId) });
    },
  });
}

export type PickedPhoto = { uri: string; mimeType?: string | null | undefined; fileName?: string | null | undefined };

/** Upload into your own folder, then register it. If registering fails, the upload is removed. */
export function useAddMoment(activityId: string, userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (v: { photo: PickedPhoto; alt: string }) => {
      const ext = photoExtension(v.photo.mimeType, v.photo.fileName);
      const path = momentPath(activityId, userId, randomUUID(), ext);
      const body = await (await fetch(v.photo.uri)).arrayBuffer();
      const up = await supabase.storage.from('moments').upload(path, body, {
        contentType: contentType(ext),
        upsert: false,
      });
      if (up.error) fail({ message: up.error.message, name: up.error.name });
      try {
        return await rpc('add_moment', { p_activity_id: activityId, p_storage_path: path, p_alt_text: v.alt.trim() });
      } catch (error) {
        await supabase.storage.from('moments').remove([path]);
        throw error;
      }
    },
    onSuccess: () => {
      track('moment_added', { activity_id: activityId });
      return queryClient.invalidateQueries({ queryKey: activityKeys.all(activityId) });
    },
  });
}

export function useMomentActions(activityId: string) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: activityKeys.all(activityId) });
  const untag = useMutation({
    mutationFn: (momentId: string) => rpc('untag_me', { p_moment_id: momentId }),
    retry: retryNetwork,
    onSuccess: () => {
      track('moment_untagged', { activity_id: activityId });
      return refresh();
    },
  });
  const remove = useMutation({
    mutationFn: async (m: { id: string; path: string }) => {
      await rpc('remove_moment', { p_moment_id: m.id });
      await supabase.storage.from('moments').remove([m.path]);
    },
    retry: retryNetwork,
    onSuccess: () => {
      track('moment_removed', { activity_id: activityId });
      return refresh();
    },
  });
  return { untag, remove };
}
