// Supabase Edge Function `payments-connect` (docs/PAYMENTS_CONTRACT.md §Connect onboarding).
// POST { action: 'onboard' | 'dashboard' | 'refresh', program_id, idempotency_key?, return_to? } with the
// host's JWT. Owners onboard the program's Stripe Express account and open its dashboard.
import { bearer, handleConnect } from '../_shared/stripeCore.ts';
import { readJson, servePayments } from '../_shared/stripe.ts';

servePayments(async (req, deps) => handleConnect(await readJson(req), bearer(req), deps));
