import { describe, expect, it, vi } from 'vitest';

import { type AccountDeleteDeps, type Blocker, bearer, chunk, runAccountDelete } from './logic';

const UID = '00000000-0000-4000-9000-000000000001';

function deps(over: Partial<AccountDeleteDeps> = {}): AccountDeleteDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    whoAmI: vi.fn(async () => ({ id: UID })),
    preflight: vi.fn(async () => ({ status: 'ready' as const, blockers: [], storage_paths: [] })),
    removeFiles: vi.fn(async (_b: string, paths: string[]) => {
      calls.push(`files:${paths.length}`);
    }),
    remove: vi.fn(async () => {
      calls.push('remove');
      return { status: 'deleted' as const, blockers: [] };
    }),
    log: vi.fn(),
    ...over,
  };
}

const ok = { confirm: 'DELETE' };

describe('account-delete', () => {
  it('reads the bearer token', () => {
    expect(bearer('Bearer abc')).toBe('abc');
    expect(bearer('abc')).toBeNull();
    expect(bearer(null)).toBeNull();
  });

  it('chunks', () => {
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
    expect(chunk([], 2)).toEqual([]);
  });

  it('needs a JWT and the typed word', async () => {
    const d = deps();
    expect((await runAccountDelete(d, null, ok)).status).toBe(401);
    const r = await runAccountDelete(d, 'jwt', { confirm: 'delete' });
    expect(r).toEqual({ status: 400, body: { error: { code: 'P0001', message: 'invalid_argument', details: 'confirm' } } });
    expect((await runAccountDelete(d, 'jwt', null)).status).toBe(400);
    expect(d.whoAmI).not.toHaveBeenCalled();
  });

  it('refuses a token Auth does not accept', async () => {
    const d = deps({ whoAmI: async () => null });
    expect((await runAccountDelete(d, 'jwt', ok)).status).toBe(401);
    expect(d.preflight).not.toHaveBeenCalled();
  });

  it('deletes the caller only: never a user named in the body', async () => {
    const d = deps({
      preflight: vi.fn(async () => ({ status: 'ready' as const, blockers: [], storage_paths: ['a/u/1.jpg', 'a/u/2.jpg'] })),
    });
    const r = await runAccountDelete(d, 'jwt', { ...ok, user_id: 'someone-else', source: 'web' });
    expect(r).toEqual({ status: 200, body: { status: 'deleted' } });
    expect(d.preflight).toHaveBeenCalledWith(UID);
    expect(d.remove).toHaveBeenCalledWith(UID, 'web');
    expect(d.calls).toEqual(['files:2', 'remove']);
  });

  it('removes files in batches before deleting', async () => {
    const paths = Array.from({ length: 205 }, (_, i) => `a/u/${i}.jpg`);
    const d = deps({ preflight: async () => ({ status: 'ready', blockers: [], storage_paths: paths }) });
    await runAccountDelete(d, 'jwt', ok);
    expect(d.calls).toEqual(['files:100', 'files:100', 'files:5', 'remove']);
  });

  it('keeps the account when Storage fails, so a retry works', async () => {
    const d = deps({
      preflight: async () => ({ status: 'ready', blockers: [], storage_paths: ['a/u/1.jpg'] }),
      removeFiles: async () => {
        throw new Error('storage 500');
      },
    });
    const r = await runAccountDelete(d, 'jwt', ok);
    expect(r.status).toBe(503);
    expect((r.body as { error: { message: string } }).error.message).toBe('account_delete_failed');
    expect(d.remove).not.toHaveBeenCalled();
  });

  it('is idempotent: already gone is success', async () => {
    const gone = deps({ whoAmI: async () => 'gone' });
    expect(await runAccountDelete(gone, 'jwt', ok)).toEqual({ status: 200, body: { status: 'already_deleted' } });
    const pre = deps({ preflight: async () => ({ status: 'already_deleted', blockers: [], storage_paths: [] }) });
    expect(await runAccountDelete(pre, 'jwt', ok)).toEqual({ status: 200, body: { status: 'already_deleted' } });
    expect(pre.remove).not.toHaveBeenCalled();
    const raced = deps({ remove: async () => ({ status: 'already_deleted', blockers: [] }) });
    expect((await runAccountDelete(raced, 'jwt', ok)).body).toEqual({ status: 'already_deleted' });
  });

  it('refuses staff with its own code', async () => {
    const staff: Blocker[] = [{ kind: 'staff', program_id: null, program_name: null }];
    const d = deps({ preflight: async () => ({ status: 'blocked', blockers: staff, storage_paths: [] }) });
    const r = await runAccountDelete(d, 'jwt', ok);
    expect(r.status).toBe(403);
    expect((r.body as { error: { message: string } }).error.message).toBe('account_delete_staff');
    expect(d.remove).not.toHaveBeenCalled();
  });

  it('says what blocks a host, with the blockers', async () => {
    const blockers: Blocker[] = [
      { kind: 'dispute_open', program_id: 'p', program_name: 'Alpha' },
      { kind: 'payout_pending', program_id: 'p', program_name: 'Alpha' },
    ];
    const d = deps({ preflight: async () => ({ status: 'blocked', blockers, storage_paths: ['x'] }) });
    const r = await runAccountDelete(d, 'jwt', ok);
    expect(r).toEqual({
      status: 409,
      body: { error: { code: 'P0001', message: 'account_delete_blocked', details: 'dispute_open' }, blockers },
    });
    expect(d.calls).toEqual([]);
  });

  it('a blocker that appears between the check and the delete still blocks', async () => {
    const blockers: Blocker[] = [{ kind: 'refund_pending', program_id: 'p', program_name: 'Alpha' }];
    const d = deps({ remove: async () => ({ status: 'blocked', blockers }) });
    expect((await runAccountDelete(d, 'jwt', ok)).status).toBe(409);
  });

  it('logs no ids', async () => {
    const d = deps();
    await runAccountDelete(d, 'jwt', ok);
    expect(JSON.stringify((d.log as ReturnType<typeof vi.fn>).mock.calls)).not.toContain(UID);
  });

  it('works without a logger', async () => {
    const d = deps({ log: undefined });
    expect((await runAccountDelete(d, 'jwt', ok)).status).toBe(200);
  });
});
