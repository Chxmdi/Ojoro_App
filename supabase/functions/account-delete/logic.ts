// The logic behind the `account-delete` Edge Function (docs/TRUST_CONTRACT.md, "Deleting your own
// account"). Pure TypeScript with injected Auth / database / Storage calls, so it runs under Deno (index.ts)
// and under vitest (logic.test.ts).
//
// Rules kept here:
//   - Who is deleting comes only from the caller's JWT, re-checked with Auth. The body never names a user.
//   - The body must say { confirm: 'DELETE' } (what the person typed), so a stray call deletes nothing.
//   - Staff accounts are refused (account_delete_staff); a host with money still moving or an open dispute
//     is refused with what to do first (account_delete_blocked + blockers).
//   - Idempotent: a person already deleted (a retry after a dropped answer) gets status 'already_deleted'.
//   - Their own photo files go from Storage before the database deletion, so a failure leaves the account
//     in place to retry. Logs carry the step and status only, never ids, names, phones or tokens.

export type BlockerKind = 'staff' | 'dispute_open' | 'refund_pending' | 'payout_pending';

export interface Blocker {
  kind: BlockerKind;
  program_id: string | null;
  program_name: string | null;
}

export interface Preflight {
  status: 'ready' | 'blocked' | 'already_deleted';
  blockers: Blocker[];
  storage_paths: string[];
}

export interface DeleteResult {
  status: 'deleted' | 'already_deleted' | 'blocked';
  blockers: Blocker[];
}

/** Who the JWT belongs to: a user id, 'gone' (a valid token whose user no longer exists), or null (not signed in). */
export type WhoAmI = { id: string } | 'gone' | null;

export interface AccountDeleteDeps {
  whoAmI(jwt: string): Promise<WhoAmI>;
  preflight(userId: string): Promise<Preflight>;
  removeFiles(bucket: string, paths: string[]): Promise<void>;
  remove(userId: string, source: 'app' | 'web'): Promise<DeleteResult>;
  log?(event: string, data: Record<string, unknown>): void;
}

export interface Answer {
  status: number;
  body: unknown;
}

export const CONFIRM_WORD = 'DELETE';
export const MOMENTS_BUCKET = 'moments';
/** Storage removes at most this many objects per call. */
export const STORAGE_BATCH = 100;

/** The PostgREST-shaped error body the app and web map with toOjoroError (code in `message`). */
export function errorAnswer(code: string, detail: string | null, status: number, extra: Record<string, unknown> = {}): Answer {
  return { status, body: { error: { code: 'P0001', message: code, details: detail ?? '' }, ...extra } };
}

export function bearer(header: string | null): string | null {
  const m = /^Bearer\s+(\S+)$/.exec(header ?? '');
  return m ? m[1]! : null;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function blockedAnswer(blockers: Blocker[]): Answer {
  if (blockers.some((b) => b.kind === 'staff')) return errorAnswer('account_delete_staff', null, 403);
  return errorAnswer('account_delete_blocked', blockers[0]?.kind ?? null, 409, { blockers });
}

export async function runAccountDelete(deps: AccountDeleteDeps, jwt: string | null, body: unknown): Promise<Answer> {
  const log = deps.log ?? (() => undefined);
  if (!jwt) return errorAnswer('not_authenticated', null, 401);
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.confirm !== CONFIRM_WORD) return errorAnswer('invalid_argument', 'confirm', 400);
  const source = b.source === 'web' ? 'web' : 'app';

  const who = await deps.whoAmI(jwt);
  if (who === 'gone') {
    log('account_delete', { status: 'already_deleted', source });
    return { status: 200, body: { status: 'already_deleted' } };
  }
  if (!who) return errorAnswer('not_authenticated', null, 401);

  const pre = await deps.preflight(who.id);
  if (pre.status === 'already_deleted') {
    log('account_delete', { status: 'already_deleted', source });
    return { status: 200, body: { status: 'already_deleted' } };
  }
  if (pre.status === 'blocked') {
    log('account_delete', { status: 'blocked', source, kinds: pre.blockers.map((x) => x.kind) });
    return blockedAnswer(pre.blockers);
  }

  try {
    for (const part of chunk(pre.storage_paths, STORAGE_BATCH)) await deps.removeFiles(MOMENTS_BUCKET, part);
  } catch {
    log('account_delete', { status: 'storage_failed', source });
    return errorAnswer('account_delete_failed', 'storage', 503);
  }

  const done = await deps.remove(who.id, source);
  if (done.status === 'blocked') {
    log('account_delete', { status: 'blocked', source, kinds: done.blockers.map((x) => x.kind) });
    return blockedAnswer(done.blockers);
  }
  log('account_delete', { status: done.status, source, files: pre.storage_paths.length });
  return { status: 200, body: { status: done.status } };
}
