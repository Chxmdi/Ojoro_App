-- Polish (GAPS-FEED): replies and @mentions in a Challenge Event's crowd notify the person they're
-- for. Enum values go in their own migration so the next one can use them.
-- Contract: docs/COMPETITION_CONTRACT.md ("Notifications").
alter type public.notification_type add value if not exists 'challenge_reply';
alter type public.notification_type add value if not exists 'challenge_mention';
