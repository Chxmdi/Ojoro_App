-- Step 8 (Trust, for payments): notices to a program's hosts about money that needs them: a refund that
-- failed, a dispute opened or decided, payouts paused because Stripe needs information. Object kind
-- 'host_program' (object_id = the program; only its owners and co-hosts can see it). Enum values go in their
-- own migration so the next one can use them. Contract: docs/TRUST_CONTRACT.md ("Notifications"),
-- docs/PAYMENTS_CONTRACT.md.
alter type public.notification_object add value if not exists 'host_program';
alter type public.notification_type add value if not exists 'host_refund_failed';
alter type public.notification_type add value if not exists 'host_dispute';
alter type public.notification_type add value if not exists 'host_payouts_paused';
