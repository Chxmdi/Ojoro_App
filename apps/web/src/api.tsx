/**
 * Every call the admin tool makes. Reads and writes go through the staff RPCs only
 * (docs/TRUST_CONTRACT.md); the server checks the staff grant on every call and audits it.
 */
import { staffRpcs, toOjoroError } from '@ojoro/contracts';

import { StaffCallError } from './lib/errors';
import type { QueueFilters } from './lib/moderation';
import type {
  AppealsPage,
  AuditEntry,
  Page,
  QueuePage,
  StaffAppealDetail,
  StaffCaseDetail,
  StaffPlace,
  WriteResult,
} from './lib/types';
import { supabase } from './supabase';

function client() {
  if (!supabase) throw new StaffCallError({ kind: 'unknown', code: 'unknown', detail: 'config' });
  return supabase;
}

type RpcFn = (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;

type StaffRpc = (typeof staffRpcs)[number] | 'my_staff_role';

async function call<T>(name: StaffRpc, args: Record<string, unknown> = {}): Promise<T> {
  const c = client();
  const rpc = c.rpc.bind(c) as unknown as RpcFn;
  let res: { data: unknown; error: unknown };
  try {
    res = await rpc(name, args);
  } catch (thrown) {
    throw new StaffCallError(toOjoroError(thrown));
  }
  if (res.error) throw new StaffCallError(toOjoroError(res.error));
  return res.data as T;
}

export const PAGE_SIZE = 25;

export const api = {
  myStaffRole: () => call<string | null>('my_staff_role'),

  queue: (f: QueueFilters, cursor: string | null) =>
    call<QueuePage>('staff_queue', { ...f, p_limit: PAGE_SIZE, p_cursor: cursor }),
  caseDetail: (id: string) => call<StaffCaseDetail>('staff_case', { p_case_id: id }),
  appeals: (status: string[], kinds: string[] | null, cursor: string | null) =>
    call<AppealsPage>('staff_appeals', { p_status: status, p_kinds: kinds, p_limit: PAGE_SIZE, p_cursor: cursor }),
  appeal: (id: string) => call<StaffAppealDetail>('staff_appeal', { p_appeal_id: id }),
  audit: (f: { p_actions: string[] | null; p_case_id: string | null; p_target_user: string | null; p_actor: string | null }, cursor: string | null) =>
    call<Page<AuditEntry>>('staff_audit_log', { ...f, p_limit: PAGE_SIZE, p_cursor: cursor }),
  places: (query: string | null, sensitive: boolean | null) =>
    call<{ items: StaffPlace[] }>('staff_places', { p_query: query, p_sensitive: sensitive, p_limit: 50 }),

  assign: (caseId: string, key: string) => call<WriteResult>('staff_assign_case', { p_case_id: caseId, p_staff_id: null, p_idempotency_key: key }),
  unassign: (caseId: string, key: string) => call<WriteResult>('staff_unassign_case', { p_case_id: caseId, p_idempotency_key: key }),
  resolve: (caseId: string, outcome: 'actioned' | 'dismissed', reason: string, key: string) =>
    call<WriteResult>('staff_resolve_case', { p_case_id: caseId, p_outcome: outcome, p_reason: reason, p_idempotency_key: key }),
  hide: (kind: string, subjectId: string, reason: string, caseId: string | null, key: string) =>
    call<WriteResult>('staff_hide_content', {
      p_subject_kind: kind,
      p_subject_id: subjectId,
      p_reason: reason,
      p_case_id: caseId,
      p_idempotency_key: key,
    }),
  restoreContent: (hideId: string, reason: string, key: string) =>
    call<WriteResult>('staff_restore_content', { p_hide_id: hideId, p_reason: reason, p_idempotency_key: key }),
  pause: (a: { userId: string; reasonCode: string; reason: string; noteToUser: string | null; endsAt: string | null; caseId: string | null }, key: string) =>
    call<WriteResult>('staff_pause_account', {
      p_user_id: a.userId,
      p_reason_code: a.reasonCode,
      p_reason: a.reason,
      p_note_to_user: a.noteToUser,
      p_ends_at: a.endsAt,
      p_case_id: a.caseId,
      p_idempotency_key: key,
    }),
  restoreAccount: (userId: string, reason: string, key: string) =>
    call<WriteResult>('staff_restore_account', { p_user_id: userId, p_reason: reason, p_idempotency_key: key }),
  decideAppeal: (a: { appealId: string; decision: 'upheld' | 'denied'; reason: string; noteToUser: string | null; effect: string | null }, key: string) =>
    call<WriteResult>('staff_decide_appeal', {
      p_appeal_id: a.appealId,
      p_decision: a.decision,
      p_reason: a.reason,
      p_note_to_user: a.noteToUser,
      p_effect: a.effect,
      p_idempotency_key: key,
    }),
  setPlaceSensitive: (placeId: string, sensitive: boolean, reason: string, key: string) =>
    call<WriteResult>('staff_set_place_sensitive', { p_place_id: placeId, p_sensitive: sensitive, p_reason: reason, p_idempotency_key: key }),

  /** A short-lived link to a reported photo (staff can read the moments bucket). */
  photoUrl: async (bucket: string, path: string): Promise<string | null> => {
    const { data, error } = await client().storage.from(bucket).createSignedUrl(path, 300);
    return error ? null : data.signedUrl;
  },
};

export function newKey(): string {
  return crypto.randomUUID();
}
