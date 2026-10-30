-- Step 6 (Communities): notification types for Ritual weeks and clan join requests, and clans as a
-- notification object. Used by 20261030220000_communities_notifications.sql (it has to come after
-- Host OS core's notification_feed, see that file).
alter type public.notification_type add value if not exists 'ritual_week';
alter type public.notification_type add value if not exists 'clan_request';
alter type public.notification_object add value if not exists 'clan';
