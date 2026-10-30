-- Step 6 (Communities, PRD M7): enum values for Crew Home, Clans and Ojoro Clash.
--
-- `alter type … add value` can't be used in the transaction that adds it, so the values live here and
-- the next migrations use them. Contract: docs/COMPETITION_CONTRACT.md → docs/COMMUNITIES_CONTRACT.md.

-- Report and block reach every crew, clan, club run and Clash (CLAUDE.md: report from every object).
alter type public.report_subject add value if not exists 'crew';
alter type public.report_subject add value if not exists 'clan';
alter type public.report_subject add value if not exists 'clan_run';
alter type public.report_subject add value if not exists 'clash';

-- Weekly plans a crew Ritual prefills (PRD §9.12).
alter type public.plan_source add value if not exists 'ritual';
