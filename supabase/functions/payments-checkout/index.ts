// Supabase Edge Function `payments-checkout` (docs/PAYMENTS_CONTRACT.md §Checkout).
// POST { pass_id? | session_id?, idempotency_key, return_to? } with the buyer's JWT → { checkout_id, url, … }.
// The price comes from the database (begin_host_checkout); Stripe's hosted page takes the card.
import { bearer, handleCheckout } from '../_shared/stripeCore.ts';
import { readJson, servePayments } from '../_shared/stripe.ts';

servePayments(async (req, deps) => handleCheckout(await readJson(req), bearer(req), deps));
