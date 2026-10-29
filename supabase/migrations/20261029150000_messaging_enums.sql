-- Step 4 (Messaging and feed, PRD M5): enum values the next migrations use.
--
-- `alter type … add value` can't be used in the transaction that adds it, so the new values live in
-- their own migration. Contract: docs/MESSAGING_CONTRACT.md.

-- Plans can be for one Crew only (Make This a Game, PRD §9.11).
alter type public.audience add value if not exists 'crew';
-- A plan made from a crew chat suggestion.
alter type public.plan_source add value if not exists 'chat';
-- Report and block from chats (PRD §11.1).
alter type public.report_subject add value if not exists 'message';
alter type public.report_subject add value if not exists 'update';
