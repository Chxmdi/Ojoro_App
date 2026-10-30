// Supabase Edge Function `concierge`: TELL OJORO with Claude (docs/CONCIERGE_CONTRACT.md).
//
// POST { text } with the person's JWT → ConciergeAnswer. The candidate search runs as the person
// (PostgREST with their JWT), so the model only ever sees what they could see. The rate limit and
// the decision log run with the service role. ANTHROPIC_API_KEY comes from the environment; without
// it (or on any failure) the answer is the rules stub's. The text is never stored or logged.
//
// The SDK is pinned exactly in deno.json (npm:@anthropic-ai/sdk@1.3.0) and imported statically: the
// Edge Runtime only resolves npm packages in the static module graph (a dynamic npm import fails with
// "Could not find constraint"). Hosted deploys bundle it at deploy time. A client is only built when
// a key is set. Supabase is reached with plain fetch (no supabase-js).

import Anthropic from '@anthropic-ai/sdk';
import {
  type CandidateSet,
  CONCIERGE_TIMEOUT_MS,
  type ConciergeDeps,
  type MessagesClient,
  runConcierge,
} from './logic.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): unknown;
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

/** A PostgREST error body ({ code, message, details }) or our own, with the Ojoro code in message. */
function ojoroError(code: string, detail: string | null, status: number): Response {
  return json({ code: 'P0001', message: code, details: detail ?? '', hint: null }, status);
}

class RestError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`rest ${status}`);
  }
}

async function rest(url: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new RestError(res.status, body);
  return body;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const base = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const auth = req.headers.get('Authorization') ?? '';
  if (!base || !anon || !service) return json({ error: 'not_configured' }, 500);
  if (!/^Bearer\s+\S+$/.test(auth)) return ojoroError('not_authenticated', null, 401);

  // Who is asking (the gateway verified the JWT; this resolves it to a user id).
  const who = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: auth } });
  const user = (await who.json().catch(() => null)) as { id?: string } | null;
  if (!who.ok || !user?.id) return ojoroError('not_authenticated', null, 401);
  const userId = user.id;

  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;

  const asPerson = { apikey: anon, Authorization: auth, 'Content-Type': 'application/json' };
  const asService = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };
  const rpc = (name: string, args: unknown, headers: Record<string, string>) =>
    rest(`${base}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(args) });

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  const deps: ConciergeDeps = {
    candidates: async (text) => (await rpc('concierge_candidates', { p_text: text, p_limit: 6 }, asPerson)) as CandidateSet,
    sports: async () =>
      ((await rest(`${base}/rest/v1/sports?select=id&order=sort_order`, { headers: asPerson })) as Array<{ id: string }>).map(
        (s) => s.id,
      ),
    gate: async () =>
      (await rpc('concierge_ai_gate', { p_user_id: userId }, asService)) as Awaited<ReturnType<ConciergeDeps['gate']>>,
    record: async (payload) => {
      // The function log gets the same short facts as the table: never the text, never the key.
      console.log(JSON.stringify({ fn: 'concierge', ...payload }));
      await rpc('concierge_ai_record', { p_user_id: userId, p_payload: payload }, asService);
    },
    claude: async () => {
      if (!key) return null;
      // No retries: a slow or failed call falls back to the rules answer instead of making people wait.
      const client: MessagesClient = new Anthropic({ apiKey: key, maxRetries: 0, timeout: CONCIERGE_TIMEOUT_MS });
      return client;
    },
    now: () => new Date(),
  };

  try {
    return json(await runConcierge(deps, body?.text));
  } catch (e) {
    if (e instanceof RestError) {
      // The person's own errors from the search (invalid_argument, not_authenticated…), as PostgREST gave them.
      return json(e.body ?? { error: 'search_failed' }, e.status >= 500 ? 502 : e.status);
    }
    const code = (e as { code?: string } | null)?.code;
    if (code === 'invalid_argument') return ojoroError('invalid_argument', 'text', 400);
    console.log(JSON.stringify({ fn: 'concierge', error: (e as Error)?.name ?? 'unknown' }));
    return json({ error: 'concierge_failed' }, 500);
  }
});
