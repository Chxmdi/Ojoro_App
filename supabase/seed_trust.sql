-- Step 8 (Trust) local data: two staff accounts and a few open cases so the admin queue isn't empty.
-- Safe to re-run; run it after the other seeds (it reports seed_messaging.sql's people and messages).
-- Contract: docs/TRUST_CONTRACT.md ("Local data"). Sign in with the test numbers in supabase/config.toml
-- (code 123456): 15555550190 Ojoro Staff (admin), 15555550191 Ojoro Moderator (moderator).
-- Names and texts are sample content.

begin;
set local ojoro.seed_reset = 'on';

create temporary table seed_trust_staff (id uuid, phone text, name text, handle text, role text) on commit drop;
insert into seed_trust_staff values
  ('a0000000-0000-4000-8000-000000000090', '15555550190', 'Ojoro Staff', 'ojoro_staff', 'admin'),
  ('a0000000-0000-4000-8000-000000000091', '15555550191', 'Ojoro Moderator', 'ojoro_mod', 'moderator');

insert into auth.users (
  instance_id, id, aud, role, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change, phone_change_token, email_change_token_current, reauthentication_token
)
select '00000000-0000-0000-0000-000000000000', s.id, 'authenticated', 'authenticated', s.phone, now(),
       '{"provider":"phone","providers":["phone"]}', jsonb_build_object('display_name', s.name),
       now() - interval '60 days', now(), '', '', '', '', '', '', '', ''
from seed_trust_staff s
on conflict (id) do nothing;

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select s.id::text, s.id, jsonb_build_object('sub', s.id::text, 'phone', s.phone, 'phone_verified', true),
       'phone', now(), now() - interval '60 days', now()
from seed_trust_staff s
on conflict do nothing;

update public.profiles pr
   set handle = s.handle, display_name = s.name, area = 'Montréal',
       onboarding_completed_at = coalesce(pr.onboarding_completed_at, now() - interval '59 days')
  from seed_trust_staff s
 where pr.id = s.id;

insert into private.staff_members (user_id, role, note)
select s.id, s.role, 'Local seed' from seed_trust_staff s
on conflict (user_id) do update set role = excluded.role;

-- Sample cases --------------------------------------------------------------------------------------------------
-- Rebuilt on every run: the seed's own reports and their open cases go first.

create temporary table seed_trust_reports (
  reporter uuid, kind public.report_subject, subject uuid, reason public.report_reason, note text, ago interval
) on commit drop;

insert into seed_trust_reports
-- A profile sending the same link to everyone (2 reporters, spam: low).
select r.reporter, 'profile', 'a0000000-0000-4000-8000-000000000027', 'spam', r.note, r.ago
from (values ('a0000000-0000-4000-8000-000000000021'::uuid, 'Sent me the same link three times after one game.', interval '2 days'),
             ('a0000000-0000-4000-8000-000000000022'::uuid, null, interval '1 day')) r(reporter, note, ago)
where exists (select 1 from public.profiles where id = 'a0000000-0000-4000-8000-000000000027');

-- A crew message three people reported (harassment, 3 reporters: high).
insert into seed_trust_reports
select r.reporter, 'message', m.id, 'harassment', r.note, r.ago
from (select m.id from public.messages m join public.crews c on c.id = m.crew_id
      where c.name = 'Thursday FC' and m.sender_id = 'a0000000-0000-4000-8000-000000000004'
        and m.kind = 'text' and m.deleted_at is null
      order by m.created_at desc limit 1) m
cross join (values ('a0000000-0000-4000-8000-000000000001'::uuid, 'Aimed at one person in the crew.', interval '5 hours'),
                   ('a0000000-0000-4000-8000-000000000002'::uuid, null, interval '4 hours'),
                   ('a0000000-0000-4000-8000-000000000005'::uuid, 'Not the first time.', interval '3 hours')) r(reporter, note, ago);

-- A game update one person said was unsafe (high).
insert into seed_trust_reports
select 'a0000000-0000-4000-8000-000000000004', 'update', u.id, 'unsafe', 'Says to meet somewhere off the map.', interval '90 minutes'
from (select u.id from public.activity_updates u
      where u.author_id = 'a0000000-0000-4000-8000-000000000002' and u.kind = 'post' and u.deleted_at is null
      order by u.created_at desc limit 1) u;

delete from public.reports r using seed_trust_reports s
 where r.reporter_id = s.reporter and r.subject_kind = s.kind and r.subject_id = s.subject;
delete from private.moderation_cases c using seed_trust_reports s
 where c.subject_kind = s.kind and c.subject_id = s.subject
   and not exists (select 1 from public.reports r where r.case_id = c.id);

insert into public.reports (reporter_id, subject_kind, subject_id, reason, note, created_at)
select s.reporter, s.kind, s.subject, s.reason, s.note, now() - s.ago
from seed_trust_reports s
where exists (select 1 from public.profiles p where p.id = s.reporter)
order by s.ago desc;

commit;
