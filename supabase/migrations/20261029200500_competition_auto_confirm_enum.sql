-- Step 5 (Competition): a result the other side never answered is confirmed after 48 hours. The
-- source records that (`alter type … add value` needs its own migration). Contract:
-- docs/COMPETITION_CONTRACT.md §Result and verification.
alter type public.challenge_result_source add value if not exists 'unanswered_auto_confirmed';
