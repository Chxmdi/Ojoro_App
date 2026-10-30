-- Step 8 (Trust): notification types for a pause starting and ending and an appeal being decided, and an
-- 'account' object (the person's own account; object_id = their user id). Enum values go in their own
-- migration so the next one can use them. Contract: docs/TRUST_CONTRACT.md ("Notifications").
alter type public.notification_object add value if not exists 'account';
alter type public.notification_type add value if not exists 'account_paused';
alter type public.notification_type add value if not exists 'account_restored';
alter type public.notification_type add value if not exists 'appeal_decided';
