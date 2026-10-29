-- Step 5 (Competition, PRD M6): enum values the next migrations use.
--
-- `alter type … add value` can't be used in the transaction that adds it, so the new values live in
-- their own migration. Contract: docs/COMPETITION_CONTRACT.md.

-- Report from every Call-Out, Challenge Event, event post and comment (PRD §10.5, §11.1).
alter type public.report_subject add value if not exists 'call_out';
alter type public.report_subject add value if not exists 'challenge_event';
alter type public.report_subject add value if not exists 'challenge_post';
alter type public.report_subject add value if not exists 'challenge_comment';

-- Notifications (PRD §10.11: meaningful milestones only). 'challenge_response' exists since Step 4.
alter type public.notification_type add value if not exists 'call_out';
alter type public.notification_type add value if not exists 'challenge_posts';
alter type public.notification_type add value if not exists 'challenge_milestone';
alter type public.notification_type add value if not exists 'challenge_to_confirm';

-- 'challenge' (Step 4) is a Call-Out; a Challenge Event is its own object.
alter type public.notification_object add value if not exists 'challenge_event';
