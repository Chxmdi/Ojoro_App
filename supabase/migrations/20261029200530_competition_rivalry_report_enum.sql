-- Step 5 (Competition): report a rivalry (its header menu), PRD §11.1. `alter type … add value`
-- needs its own migration. Contract: docs/COMPETITION_CONTRACT.md §Privacy and safety.
alter type public.report_subject add value if not exists 'rivalry';
