// Supabase Edge Function `payments-drain` (docs/PAYMENTS_CONTRACT.md §Refunds and the queue).
// POST { limit? } with `Authorization: Bearer <PAYMENTS_CRON_SECRET>` (pg_cron via pg_net, or a test):
// sends queued refunds and subscription changes to Stripe, with idempotency keys, and records the answers.
import { handleDrain } from '../_shared/stripeCore.ts';
import { servePayments } from '../_shared/stripe.ts';

servePayments((req, deps) => handleDrain(req, deps));
