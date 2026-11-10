// Supabase Edge Function `account-delete`: a signed-in person deletes their own account
// (docs/TRUST_CONTRACT.md, "Deleting your own account"). Called by the app (Settings → Account → DELETE
// ACCOUNT) and the public web page (apps/web /delete-account).
//
// POST { confirm: 'DELETE', source?: 'app' | 'web' } with the person's JWT →
//   200 { status: 'deleted' | 'already_deleted' }
//   403 account_delete_staff · 409 account_delete_blocked (+ blockers) · 401 not_authenticated ·
//   400 invalid_argument (confirm) · 503 account_delete_failed.
//
// The service role key is used here only, server side, after Auth confirms who the JWT belongs to. Plain
// fetch (no supabase-js). The logic is in ./logic.ts.

import { type AccountDeleteDeps, type WhoAmI, bearer, errorAnswer, runAccountDelete } from './logic.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): unknown;
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function log(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ fn: 'account-delete', event, ...data }));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const base = Deno.env.get('SUPABASE_URL')?.replace(/\/+$/, '');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!base || !anon || !service) {
    const a = errorAnswer('account_delete_failed', 'not_configured', 503);
    return json(a.body, a.status);
  }
  const asService = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };

  async function rpc<T>(name: string, args: unknown): Promise<T> {
    const res = await fetch(`${base}/rest/v1/rpc/${name}`, { method: 'POST', headers: asService, body: JSON.stringify(args) });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`rpc ${name} ${res.status}`);
    return body as T;
  }

  const deps: AccountDeleteDeps = {
    async whoAmI(jwt): Promise<WhoAmI> {
      // Auth checks the token (signature, expiry, a session that still exists) and returns its user.
      const res = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${jwt}` } });
      const body = (await res.json().catch(() => null)) as { id?: string; code?: string; error_code?: string } | null;
      if (res.ok && body?.id) return { id: body.id };
      const code = body?.error_code ?? body?.code;
      // A valid token whose user (or session) is already gone: the deletion went through earlier.
      if (code === 'user_not_found' || code === 'session_not_found') return 'gone';
      return null;
    },
    preflight: (userId) => rpc('account_deletion_preflight', { p_user_id: userId }),
    async removeFiles(bucket, paths) {
      const res = await fetch(`${base}/storage/v1/object/${bucket}`, {
        method: 'DELETE',
        headers: asService,
        body: JSON.stringify({ prefixes: paths }),
      });
      if (!res.ok) throw new Error(`storage ${res.status}`);
    },
    remove: (userId, source) => rpc('account_delete', { p_user_id: userId, p_source: source }),
    log,
  };

  try {
    const body = await req.json().catch(() => null);
    const a = await runAccountDelete(deps, bearer(req.headers.get('Authorization')), body);
    return json(a.body, a.status);
  } catch (e) {
    log('account_delete_error', { type: e instanceof Error ? e.name : 'unknown' });
    const a = errorAnswer('account_delete_failed', null, 500);
    return json(a.body, a.status);
  }
});
