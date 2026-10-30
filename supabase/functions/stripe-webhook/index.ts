// Supabase Edge Function `stripe-webhook` (docs/PAYMENTS_CONTRACT.md §Webhook).
// Stripe POSTs events here. The Stripe-Signature header is verified against STRIPE_WEBHOOK_SECRET (and
// STRIPE_CONNECT_WEBHOOK_SECRET); each event id is recorded into the ledger once
// (payments_record_stripe_event), then due refunds / subscription changes are sent.
// Public (verify_jwt = false): the signature is the authentication.
import { handleWebhook } from '../_shared/stripeCore.ts';
import { servePayments } from '../_shared/stripe.ts';

servePayments(async (req, deps) => handleWebhook(await req.text(), req.headers.get('Stripe-Signature'), deps));
