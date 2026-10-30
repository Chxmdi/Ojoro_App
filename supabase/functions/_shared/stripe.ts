// Deno adapter for the payments functions (docs/PAYMENTS_CONTRACT.md): the real Stripe SDK (pinned),
// the PostgREST client, the environment, and a request wrapper. The logic is in ./stripeCore.ts.
//
// TEST MODE ONLY: readPaymentsEnv refuses live keys and any STRIPE_MODE but test. With STRIPE_API_BASE
// set (stripe-mock), the SDK talks to it instead of api.stripe.com.

import Stripe from 'npm:stripe@23.0.0';
import {
  type Deps,
  type HttpAnswer,
  type PaymentsEnv,
  type StripeLike,
  errorAnswer,
  readPaymentsEnv,
  restDb,
  toResponse,
} from './stripeCore.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): unknown;
};

export function makeStripe(env: PaymentsEnv): StripeLike {
  const options: Record<string, unknown> = {
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
    timeout: 20000,
    appInfo: { name: 'Ojoro', url: 'https://ojoro.app' },
  };
  if (env.apiBase) {
    options.host = env.apiBase.host;
    options.port = env.apiBase.port;
    options.protocol = env.apiBase.protocol;
  }
  return new Stripe(env.secretKey, options) as unknown as StripeLike;
}

function log(event: string, data: Record<string, unknown>) {
  // Ids, types and codes only; never keys, bodies or personal data.
  console.log(JSON.stringify({ fn: 'payments', event, ...data }));
}

/** Serve one payments function: CORS preflight, env checks (live refused), deps, errors. */
export function servePayments(
  handler: (req: Request, deps: Deps) => Promise<HttpAnswer>,
  options: { methods?: string[] } = {},
) {
  const methods = options.methods ?? ['POST'];
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return toResponse({ status: 204 });
    if (!methods.includes(req.method)) return toResponse({ status: 405, body: { error: 'method_not_allowed' } });
    const r = readPaymentsEnv((name) => Deno.env.get(name));
    if (!r.ok) {
      log('payments_unavailable', { detail: r.detail });
      return toResponse(errorAnswer('payments_unavailable', r.detail, 503));
    }
    const deps: Deps = { env: r.env, db: restDb(r.env, fetch), stripe: makeStripe(r.env), log };
    try {
      return toResponse(await handler(req, deps));
    } catch (e) {
      log('payments_error', { type: e instanceof Error ? e.name : 'unknown' });
      return toResponse(errorAnswer('unknown', null, 500));
    }
  });
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
