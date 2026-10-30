// Supabase Edge Function `payments-return` (docs/PAYMENTS_CONTRACT.md §Return links).
// GET from Stripe's hosted Checkout / onboarding pages → 302 to the app (allowed origins only).
// Public (verify_jwt = false): it reads nothing and writes nothing.
import { handleReturn, readPaymentsEnv, toResponse } from '../_shared/stripeCore.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): unknown;
};

Deno.serve((req) => {
  if (req.method !== 'GET') return toResponse({ status: 405, body: { error: 'method_not_allowed' } });
  const r = readPaymentsEnv((name) => Deno.env.get(name));
  const origins = r.ok
    ? r.env.returnOrigins
    : (Deno.env.get('PAYMENTS_RETURN_ORIGINS') ?? 'ojoro://').split(',').map((s) => s.trim()).filter(Boolean);
  return toResponse(handleReturn(new URL(req.url), { returnOrigins: origins }));
});
