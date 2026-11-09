-- Generated preamble + body. Run with: npx supabase test db
begin;
-- Shared setup (repeated in every test file; each file runs in its own transaction and rolls back).
-- People tests.u(1..12) live in the Plateau (45.52, -73.58) with a 5 km radius. One test place,
-- "Test Pitch", with a meeting point at the north pitch.
create extension if not exists pgtap with schema extensions;

create schema tests;
grant usage on schema tests to authenticated;

create function tests.u(n integer) returns uuid language sql immutable
as $$ select ('00000000-0000-4000-9000-' || lpad(n::text, 12, '0'))::uuid $$;

create table tests.ids (k text primary key, v uuid);
grant select on tests.ids to authenticated;
create function tests.id(p_k text) returns uuid language sql stable
as $$ select v from tests.ids where k = p_k $$;
create function tests.keep(p_k text, p_v uuid) returns uuid language sql security definer
as $$ insert into tests.ids values (p_k, p_v) on conflict (k) do update set v = excluded.v returning v $$;

create function tests.login(n integer) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', tests.u(n), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function tests.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

insert into auth.users (id, instance_id, aud, role, raw_user_meta_data)
select tests.u(n), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       jsonb_build_object('display_name', 'Tester ' || n)
from generate_series(1, 12) n;
update public.profile_private set area_lat = 45.52, area_lng = -73.58, discovery_radius_km = 5
 where user_id in (select tests.u(n) from generate_series(1, 12) n);

insert into public.places (id, slug, name, area, city, lat, lng, sport_ids)
values ('00000000-0000-4000-9100-000000000001', 'test-pitch', 'Test Pitch', 'Plateau', 'Montréal',
        45.5165, -73.5862, '{football,running}');

-- A forming plan hosted by tests.u(p_host). Deadline halfway to the start.
create function tests.make_plan(
  p_host integer, p_capacity integer, p_starts interval default '3 hours',
  p_audience public.audience default 'public'
) returns uuid language plpgsql security definer as $$
declare
  v uuid;
begin
  insert into public.plans (sport_id, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
                            source, created_by, host_id, member_count, team_a_label, team_b_label)
  values ('football', now() + p_starts, 90, '00000000-0000-4000-9100-000000000001', p_capacity, p_audience,
          now() + p_starts / 2, 'quick', tests.u(p_host), tests.u(p_host), 1, 'Lights', 'Darks')
  returning id into v;
  insert into public.plan_members (plan_id, user_id, via) values (v, tests.u(p_host), 'host');
  insert into public.plan_meeting_points (plan_id, label, lat, lng) values (v, 'North pitch', 45.5190, -73.5880);
  return v;
end;
$$;

-- tests.u(n) taps I'M DOWN with a fresh key.
create function tests.join(n integer, p_plan uuid) returns public.plan_state language plpgsql as $$
declare
  v public.plan_state;
begin
  perform tests.login(n);
  v := public.im_down(p_plan, gen_random_uuid());
  perform tests.logout();
  return v;
end;
$$;

-- tests.u(a) and tests.u(b) played a finished game together a week ago (makes them "connected").
create function tests.connect(a integer, b integer) returns uuid language plpgsql security definer as $$
declare
  v_plan uuid;
  v_act uuid;
begin
  insert into public.plans (sport_id, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
                            status, source, created_by, host_id, member_count)
  values ('football', now() - interval '7 days', 90, '00000000-0000-4000-9100-000000000001', 2, 'public',
          now() - interval '7 days 1 hour', 'game_on', 'quick', tests.u(a), tests.u(a), 2)
  returning id into v_plan;
  insert into public.plan_members (plan_id, user_id, via) values (v_plan, tests.u(a), 'host'), (v_plan, tests.u(b), 'im_down');
  insert into public.activities (plan_id, sport_id, starts_at, ends_at, place_id, capacity, host_id, confirmed_count,
                                 checked_in_count, attendance_rule, check_in_opens_at, check_in_closes_at, status,
                                 after_closes_at)
  values (v_plan, 'football', now() - interval '7 days', now() - interval '7 days' + interval '90 minutes',
          '00000000-0000-4000-9100-000000000001', 2, tests.u(a), 2, 2, 'check_in', now() - interval '7 days 30 minutes',
          now() - interval '7 days' + interval '90 minutes', 'complete', now() - interval '6 days')
  returning id into v_act;
  insert into public.attendance (activity_id, user_id, status, confirmed_at, checked_in_at, check_in_method)
  values (v_act, tests.u(a), 'checked_in', now() - interval '8 days', now() - interval '7 days', 'location'),
         (v_act, tests.u(b), 'checked_in', now() - interval '8 days', now() - interval '7 days', 'location');
  insert into public.passport_entries (user_id, activity_id, sport_id, place_id, occurred_at, minutes, sport_game_number)
  values (tests.u(a), v_act, 'football', '00000000-0000-4000-9100-000000000001', now() - interval '7 days', 90, 1),
         (tests.u(b), v_act, 'football', '00000000-0000-4000-9100-000000000001', now() - interval '7 days', 90, 1);
  return v_act;
end;
$$;

-- Step 4 helpers (messaging). A crew owned by tests.u(p_owner) with tests.u(n) members.
create function tests.make_crew(p_owner integer, p_members integer[], p_name text default 'Test Crew')
returns uuid language plpgsql security definer as $$
declare
  v uuid;
begin
  insert into public.crews (name, sport_id, created_by) values (p_name, 'football', tests.u(p_owner)) returning id into v;
  insert into public.crew_members (crew_id, user_id, role, via) values (v, tests.u(p_owner), 'owner', 'created');
  insert into public.crew_members (crew_id, user_id, role, via, invited_by)
  select v, tests.u(n), 'member', 'added', tests.u(p_owner) from unnest(p_members) n where n <> p_owner;
  update public.crews set member_count = (select count(*) from public.crew_members m where m.crew_id = v) where id = v;
  return v;
end;
$$;

-- A game that has been live for 30 minutes: tests.u(p_host) hosts, p_players checked in.
create function tests.live_game(p_host integer, p_players integer[],
                                p_rule public.attendance_rule default 'check_in_host_confirms')
returns uuid language plpgsql security definer as $$
declare
  v_plan uuid;
  v_act uuid;
begin
  insert into public.plans (sport_id, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
                            status, source, created_by, host_id, member_count, team_a_label, team_b_label)
  values ('football', now() - interval '30 minutes', 90, '00000000-0000-4000-9100-000000000001', 8, 'public',
          now() - interval '90 minutes', 'game_on', 'quick', tests.u(p_host), tests.u(p_host),
          cardinality(p_players), 'Lights', 'Darks')
  returning id into v_plan;
  insert into public.plan_members (plan_id, user_id, via)
  select v_plan, tests.u(n), case when n = p_host then 'host'::public.member_via else 'im_down'::public.member_via end
  from unnest(p_players) n;
  insert into public.activities (plan_id, sport_id, starts_at, ends_at, place_id, capacity, host_id, confirmed_count,
                                 checked_in_count, attendance_rule, check_in_opens_at, check_in_closes_at, status,
                                 live_at, after_closes_at, team_a_label, team_b_label)
  values (v_plan, 'football', now() - interval '30 minutes', now() + interval '60 minutes',
          '00000000-0000-4000-9100-000000000001', 8, tests.u(p_host), cardinality(p_players), cardinality(p_players),
          p_rule, now() - interval '60 minutes', now() + interval '60 minutes', 'live', now() - interval '30 minutes',
          now() + interval '25 hours', 'Lights', 'Darks')
  returning id into v_act;
  insert into public.attendance (activity_id, user_id, status, confirmed_at, checked_in_at, check_in_method)
  select v_act, tests.u(n), 'checked_in', now() - interval '2 hours', now() - interval '40 minutes', 'host'
  from unnest(p_players) n;
  return v_act;
end;
$$;

create function tests.block(a integer, b integer) returns void language sql security definer as $$
  insert into public.blocks (blocker_id, blocked_id) values (tests.u(a), tests.u(b)) on conflict do nothing;
$$;

create function tests.crew_code(p_crew uuid) returns text language sql security definer as $$
  select code from private.crew_invite_codes where crew_id = p_crew
$$;
-- Step 5 helpers (competition). tests.u(a) calls out tests.u(b) (null: an open call-out) to a 5K
-- run at Test Pitch, p_starts from now. Returns the call-out id.
create function tests.call_out(a integer, b integer, p_starts interval default '3 days',
                               p_audience public.challenge_audience default 'public')
returns uuid language plpgsql as $$
declare
  v uuid;
begin
  perform tests.login(a);
  v := (public.create_call_out(gen_random_uuid(), 'running', '5K', 'time', now() + p_starts,
        p_opponent_id => case when b is null then null else tests.u(b) end, p_target => 5, p_unit => 'km',
        p_place_id => '00000000-0000-4000-9100-000000000001', p_audience => p_audience,
        p_message => 'Bring your legs.')).call_out_id;
  perform tests.logout();
  return v;
end;
$$;

-- An accepted Challenge Event: tests.u(a) is side a (challenger), tests.u(b) side b.
create function tests.event(a integer, b integer, p_starts interval default '3 days',
                            p_audience public.challenge_audience default 'public')
returns uuid language plpgsql as $$
declare
  v_o uuid := tests.call_out(a, b, p_starts, p_audience);
  v uuid;
begin
  perform tests.login(b);
  v := (public.accept_call_out(v_o, gen_random_uuid())).event_id;
  perform tests.logout();
  return v;
end;
$$;

-- Move an event's start to now() + p (check-in opens an hour before the start).
create function tests.starts_in(p_event uuid, p interval) returns void language sql security definer as $$
  update public.challenge_events
     set starts_at = now() + p, check_in_opens_at = now() + p - interval '60 minutes'
   where id = p_event;
$$;

-- Take an event LIVE: start in 10 minutes, both captains check in and press I'M READY.
create function tests.go_live(p_event uuid, a integer, b integer) returns void language plpgsql as $$
begin
  perform tests.starts_in(p_event, '10 minutes');
  perform tests.login(a);
  perform public.check_in_challenge(p_event);
  perform public.ready_challenge(p_event);
  perform tests.login(b);
  perform public.check_in_challenge(p_event);
  perform public.ready_challenge(p_event);
  perform tests.logout();
end;
$$;

-- tests.u(n) predicts (or backs) side p_side.
create function tests.predict(n integer, p_event uuid, p_side public.team_side) returns void language plpgsql as $$
begin
  perform tests.login(n);
  perform public.predict_challenge(p_event, p_side);
  perform tests.logout();
end;
$$;

-- A finished result between a and b (a's time, b's time in seconds), submitted by a, confirmed by b.
create function tests.finish(p_event uuid, a integer, b integer, p_a numeric, p_b numeric) returns void
language plpgsql as $$
declare
  v_s uuid;
begin
  perform tests.login(a);
  v_s := (public.submit_challenge_result(p_event, p_a, p_b, gen_random_uuid())).submission_id;
  perform tests.login(b);
  perform public.confirm_challenge_result(v_s, gen_random_uuid());
  perform tests.logout();
end;
$$;

-- Step 7 BE-PASSPORT helpers. A complete Challenge between tests.u(a) (side a) and tests.u(b): a's and
-- b's values in seconds, verified by both. Returns the event id.
create function tests.result(a integer, b integer, p_a numeric, p_b numeric) returns uuid language plpgsql as $$
declare
  v uuid := tests.event(a, b);
begin
  perform tests.go_live(v, a, b);
  -- Each result a minute after the one before (the stamp's time is when it went live).
  perform set_config('role', 'postgres', true);
  update public.challenge_events
     set live_at = now() - interval '1 day' + make_interval(mins => (select count(*)::integer from public.challenge_results))
   where id = v;
  perform tests.finish(v, a, b, p_a, p_b);
  return v;
end;
$$;

-- A finished game for tests.u(n) at Test Pitch (or p_place), p_ago before now, with its stamp.
create function tests.stamp(n integer, p_ago interval, p_sport text default 'football',
                            p_place uuid default '00000000-0000-4000-9100-000000000001')
returns uuid language plpgsql security definer as $$
declare
  v_plan uuid;
  v_act uuid;
begin
  insert into public.plans (sport_id, starts_at, duration_minutes, place_id, capacity, audience, deadline_at,
                            status, source, created_by, host_id, member_count)
  values (p_sport, now() - p_ago, 60, p_place, 2, 'public', now() - p_ago - interval '1 hour', 'game_on', 'quick',
          tests.u(n), tests.u(n), 1)
  returning id into v_plan;
  insert into public.plan_members (plan_id, user_id, via) values (v_plan, tests.u(n), 'host');
  insert into public.activities (plan_id, sport_id, starts_at, ends_at, place_id, capacity, host_id, confirmed_count,
                                 checked_in_count, attendance_rule, check_in_opens_at, check_in_closes_at, status,
                                 after_closes_at)
  values (v_plan, p_sport, now() - p_ago, now() - p_ago + interval '60 minutes', p_place, 2, tests.u(n), 1, 1,
          'check_in', now() - p_ago - interval '30 minutes', now() - p_ago + interval '60 minutes', 'complete',
          now() - p_ago + interval '1 day')
  returning id into v_act;
  insert into public.attendance (activity_id, user_id, status, confirmed_at, checked_in_at, check_in_method)
  values (v_act, tests.u(n), 'checked_in', now() - p_ago - interval '1 day', now() - p_ago, 'location');
  insert into public.passport_entries (user_id, activity_id, sport_id, place_id, occurred_at, minutes, sport_game_number)
  values (tests.u(n), v_act, p_sport, p_place, now() - p_ago, 60, 1);
  return v_act;
end;
$$;
-- Step 6 helpers (Host OS core). A program owned by tests.u(p_owner).
create function tests.host_program(p_owner integer, p_name text default 'Test Pickup')
returns uuid language plpgsql security definer as $$
declare
  v uuid;
begin
  insert into public.host_programs (name, sport_id, area, created_by)
  values (p_name, 'football', 'Plateau, Montréal', tests.u(p_owner)) returning id into v;
  insert into public.host_program_hosts (program_id, user_id, role, added_by) values (v, tests.u(p_owner), 'owner', tests.u(p_owner));
  return v;
end;
$$;

-- Move a session (plan, activity and rule times) to start p_starts from now.
create function tests.host_shift(p_session uuid, p_starts interval) returns void language plpgsql security definer as $$
declare
  s public.host_sessions%rowtype;
  v_start timestamptz := now() + p_starts;
begin
  select * into s from public.host_sessions where id = p_session;
  update public.host_sessions
     set starts_at = v_start, opens_at = v_start - interval '5 days',
         members_open_at = case when s.members_first then v_start - interval '7 days' else v_start - interval '5 days' end,
         auto_fill_cutoff_at = v_start - interval '2 hours'
   where id = p_session;
  update public.plans set starts_at = v_start, deadline_at = v_start where id = s.plan_id;
  update public.activities
     set starts_at = v_start, ends_at = v_start + interval '90 minutes', check_in_opens_at = v_start - interval '30 minutes',
         check_in_closes_at = v_start + interval '90 minutes', after_closes_at = v_start + interval '90 minutes 24 hours',
         status = case when status = 'cancelled' then status
                       when v_start + interval '90 minutes 24 hours' <= now() then 'complete'::public.activity_status
                       when v_start + interval '90 minutes' <= now() then 'after'
                       when v_start <= now() then 'live' else 'confirmed' end
   where id = s.activity_id;
end;
$$;

-- One session of a fresh series (no other dates generated), starting p_starts from now.
create function tests.host_session(
  p_program uuid, p_starts interval default '2 days', p_capacity integer default 4,
  p_approval boolean default false, p_auto_fill boolean default true, p_members_first boolean default false,
  p_price integer default 800
) returns uuid language plpgsql security definer as $$
declare
  v_series uuid;
  v_sess uuid;
begin
  insert into public.host_series (program_id, name, sport_id, place_id, start_time, duration_minutes, capacity,
                                  repeat_days, starts_on, until_on, approval_required, waitlist_auto_fill,
                                  members_first, price_cents, created_by)
  values (p_program, 'Test series', 'football', '00000000-0000-4000-9100-000000000001', '19:30', 90, p_capacity,
          '{1,2,3,4,5,6,7}', '2099-01-01', '2099-01-01', p_approval, p_auto_fill, p_members_first, p_price,
          (select user_id from public.host_program_hosts where program_id = p_program and role = 'owner'))
  returning id into v_series;
  v_sess := private.host_create_session(v_series, current_date);
  perform tests.host_shift(v_sess, p_starts);
  return v_sess;
end;
$$;

create function tests.activity_of(p_session uuid) returns uuid language sql security definer as $$
  select activity_id from public.host_sessions where id = p_session
$$;

-- Step 8 TRUST helpers. tests.u(11) is an Ojoro admin, tests.u(12) a moderator.
insert into private.staff_members (user_id, role, note)
values (tests.u(11), 'admin', 'test'), (tests.u(12), 'moderator', 'test');

-- Fails with the code a statement raises (or 'ok'), for "this surface refuses it" checks.
create function tests.err(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end;
$$;

-- A finished game where tests.u(n) confirmed but never checked in (counts as missed), p_ago ago.
create function tests.missed(n integer, p_ago interval default '3 days') returns uuid
language plpgsql security definer as $$
declare
  v_act uuid := tests.stamp(1, p_ago);
begin
  insert into public.attendance (activity_id, user_id, status, confirmed_at)
  values (v_act, tests.u(n), 'confirmed', now() - p_ago - interval '1 day');
  return v_act;
end;
$$;

-- tests.u(n) checked in to a finished session of this program p_ago ago.
create function tests.host_played(p_program uuid, p_users integer[], p_ago interval default '7 days')
returns uuid language plpgsql security definer as $$
declare
  v_sess uuid;
  v_act uuid;
begin
  v_sess := tests.host_session(p_program, -p_ago, 20);
  v_act := tests.activity_of(v_sess);
  insert into public.attendance (activity_id, user_id, status, confirmed_at, checked_in_at, check_in_method)
  select v_act, tests.u(n), 'checked_in', now() - p_ago - interval '1 day', now() - p_ago, 'host' from unnest(p_users) n;
  update public.activities set confirmed_count = cardinality(p_users), checked_in_count = cardinality(p_users) where id = v_act;
  return v_sess;
end;
$$;

-- Polish GAPS-FEED: Challenge Events on Main (home_feed card `challenge_event`) and reply / @mention
-- notifications for Challenge comments (challenge_reply, challenge_mention).
select no_plan();

update public.profiles set handle = 'tester' || n from generate_series(1, 12) n where id = tests.u(n);

-- The feed's challenge cards for tests.u(n), keyed by event.
create function tests.ccard(n integer, p_event uuid) returns record language plpgsql as $$
declare
  r record;
begin
  perform tests.login(n);
  select f.card, f.title, f.reason, f.stage::text as stage, f.situation, f.href, f.event, f.position
    into r from public.home_feed() f where f.card = 'challenge_event' and f.object_id = p_event;
  perform tests.logout();
  return r;
end;
$$;
create function tests.has_card(n integer, p_event uuid) returns boolean language plpgsql as $$
declare
  v boolean;
begin
  perform tests.login(n);
  v := exists (select 1 from public.home_feed() f where f.card = 'challenge_event' and f.object_id = p_event);
  perform tests.logout();
  return v;
end;
$$;
create function tests.card_reason(n integer, p_event uuid) returns text language plpgsql as $$
declare
  v text;
begin
  perform tests.login(n);
  select f.reason into v from public.home_feed() f where f.card = 'challenge_event' and f.object_id = p_event;
  perform tests.logout();
  return v;
end;
$$;

-- tests.u(1) vs tests.u(2), 5K in 3 days, public.
select tests.keep('ev1', tests.event(1, 2));

-- Feed: competitors ------------------------------------------------------------------------------------------------
select tests.login(1);
select is((select count(*)::integer from public.home_feed() f where f.object_id = tests.id('ev1')), 1, 'one card for the event');
select tests.logout();
select is((select x.title from tests.ccard(1, tests.id('ev1')) as x(card text, title text, reason text, stage text, situation text, href text, event jsonb, position integer)),
          'Tester 1 vs Tester 2 · 5K', 'title: your side first');
select is((select x.title from tests.ccard(2, tests.id('ev1')) as x(card text, title text, reason text, stage text, situation text, href text, event jsonb, position integer)),
          'Tester 2 vs Tester 1 · 5K', 'side b sees their own name first');
select is((select row(x.stage, x.situation, x.href, x.reason)::text from tests.ccard(1, tests.id('ev1')) as x(card text, title text, reason text, stage text, situation text, href text, event jsonb, position integer)),
          row('accepted', 'forming', '/event/' || tests.id('ev1'), 'Accepted · you''re in it')::text,
          'stage in words, forming, links to the event');
select is((select x.event ->> 'my_side' || '/' || (x.event ->> 'relation') || '/' || (x.event ->> 'a_name')
           from tests.ccard(2, tests.id('ev1')) as x(card text, title text, reason text, stage text, situation text, href text, event jsonb, position integer)),
          'b/competitor/Tester 1', 'the event facts the strip draws');
-- Past the first day it's the build-up.
update public.challenge_events set accepted_at = now() - interval '2 days' where id = tests.id('ev1');
select is(tests.card_reason(1, tests.id('ev1')), 'Build-up · you''re in it', 'build-up after a day');

-- Feed: who else sees it -----------------------------------------------------------------------------------------
select is(tests.has_card(3, tests.id('ev1')), false, 'a stranger gets nothing');
select tests.login(3);
select public.follow_challenge_event(tests.id('ev1'));
select tests.logout();
select is(tests.card_reason(3, tests.id('ev1')), 'Build-up · you follow', 'a follower sees it');

select tests.make_crew(4, array[1], 'Crew Four');
select is(tests.card_reason(4, tests.id('ev1')), 'Build-up · from your crew', 'a crew-mate of a competitor sees it');

select tests.keep('ev52', tests.event(5, 2));
update public.challenge_events set accepted_at = now() - interval '2 days' where id = tests.id('ev52');
select is(tests.card_reason(5, tests.id('ev1')), 'Build-up · your rival', 'a rival of a competitor sees it');
select is(tests.card_reason(5, tests.id('ev52')), 'Build-up · you''re in it', 'and their own event');

insert into public.clans (id, name, sport_id, join_policy, created_by)
values ('00000000-0000-4000-9400-000000000044', 'Clan 44', 'running', 'open', tests.u(6));
insert into public.clan_members (clan_id, user_id, role, via)
values ('00000000-0000-4000-9400-000000000044', tests.u(6), 'captain', 'created'),
       ('00000000-0000-4000-9400-000000000044', tests.u(1), 'member', 'open');
select is(tests.card_reason(6, tests.id('ev1')), 'Build-up · from your clan', 'a clan-mate of a competitor sees it');

-- Audience: participants-only isn't shown to a crew-mate who isn't in a side's crew.
select tests.keep('ev17', tests.event(1, 7, '4 days', 'participants'));
select is(tests.has_card(1, tests.id('ev17')), true, 'the competitor sees a participants-only event');
select is(tests.has_card(4, tests.id('ev17')), false, 'a crew-mate outside the sides does not');

-- Called off: gone.
select tests.keep('ev18', tests.event(1, 8, '5 days'));
select tests.login(1);
select public.cancel_challenge_event(tests.id('ev18'));
select tests.logout();
select is(tests.has_card(1, tests.id('ev18')), false, 'a called-off event is not on Main');

-- At most 4 challenge cards; caught_up stays last.
select tests.event(1, 9, '6 days');
select tests.event(1, 10, '7 days');
select tests.login(1);
select is((select count(*)::integer from public.home_feed() where card = 'challenge_event'), 4, 'at most 4 challenge cards');
select is((select card from public.home_feed() order by position desc limit 1), 'caught_up', 'caught up stays last');
select is((select count(distinct position)::integer = count(*)::integer from public.home_feed()), true, 'positions are distinct');
select is((select bool_and(stage is null and event is null) from public.home_feed() where card <> 'challenge_event'), true,
          'other cards carry no stage or event');
select tests.logout();

-- Comments: replies and mentions -----------------------------------------------------------------------------------
select tests.login(3);
select tests.keep('c3', (public.comment_on_challenge(tests.id('ev1'), 'Tester 1 by a minute.', gen_random_uuid())).id);
select tests.login(4);
select public.comment_on_challenge(tests.id('ev1'), 'No chance.', gen_random_uuid(), tests.id('c3'));
select tests.login(3);
select is((select row(title, body, href, needs_you, action)::text from public.my_notifications() where type = 'challenge_reply'),
          row('Tester 4 replied to your comment.', 'Tester 1 vs Tester 2 · 5K. Open the crowd to reply.',
              '/event/' || tests.id('ev1'), false, 'open')::text, 'a reply notifies the comment''s author');
-- Replying to yourself: nothing new.
select public.comment_on_challenge(tests.id('ev1'), 'Still saying it.', gen_random_uuid(), tests.id('c3'));
select is((select count from public.my_notifications() where type = 'challenge_reply'), 1, 'replying to yourself notifies nobody');
-- A second person replies (and mentions the author): bundled into the same row, no separate mention.
select tests.login(6);
select public.comment_on_challenge(tests.id('ev1'), '@tester3 agreed.', gen_random_uuid(), tests.id('c3'));
select tests.login(3);
select is((select count(*)::integer from public.my_notifications() where type = 'challenge_reply'), 1, 'bundled per event');
select is((select title from public.my_notifications() where type = 'challenge_reply'), 'Tester 6 and 1 more replied to you.', 'the bundle says who');
select is((select count(*)::integer from public.my_notifications() where type = 'challenge_mention'), 0,
          'a reply that mentions its parent''s author notifies once');

-- Mentions.
select tests.login(4);
select tests.keep('m4', (public.comment_on_challenge(tests.id('ev1'), 'Watch this @Tester5 and @tester7', gen_random_uuid())).id);
select tests.login(5);
select is((select row(title, href, needs_you)::text from public.my_notifications() where type = 'challenge_mention'),
          row('Tester 4 mentioned you.', '/event/' || tests.id('ev1'), false)::text, 'a mention notifies (handles ignore case)');
select tests.login(7);
select is((select count(*)::integer from public.my_notifications() where type = 'challenge_mention'), 1, 'everyone mentioned');
-- Someone who can't see the event isn't told.
select tests.login(1);
select public.comment_on_challenge(tests.id('ev17'), 'Ready @tester4', gen_random_uuid());
select tests.login(4);
select is((select count(*)::integer from public.my_notifications() where type = 'challenge_mention'), 0,
          'no mention for someone outside the audience');
-- Blocks either way.
select tests.logout();
select tests.block(8, 4);
select tests.login(4);
select public.comment_on_challenge(tests.id('ev1'), 'Hey @tester8', gen_random_uuid());
select tests.login(8);
select is((select count(*)::integer from public.my_notifications() where type = 'challenge_mention'), 0, 'no mention across a block');
-- MUTE COMMENTS means no comment notifications either.
select tests.login(9);
select public.follow_challenge_event(tests.id('ev1'), p_comments_muted => true);
select tests.login(4);
select public.comment_on_challenge(tests.id('ev1'), 'And @tester9', gen_random_uuid());
select tests.login(9);
select is((select count(*)::integer from public.my_notifications() where type = 'challenge_mention'), 0, 'muted comments: no mention');
-- Deleting the comment takes the mention away.
select tests.login(4);
select public.delete_challenge_comment(tests.id('m4'));
select tests.login(5);
select is((select count(*)::integer from public.my_notifications() where type = 'challenge_mention'), 0, 'a deleted comment''s mention goes away');
select tests.logout();

-- Throttled pushes and generic words.
select ok('challenge_reply' = any (private.push_throttled_types()) and 'challenge_mention' = any (private.push_throttled_types()),
          'pushes throttled like chat mentions');
select is(private.generic_copy('challenge_reply'), 'Someone replied to your comment.', 'generic words (reply)');
select is(private.generic_copy('challenge_mention'), 'You were mentioned in a comment.', 'generic words (mention)');
-- Noon today in Montréal: outside any quiet hours, whatever the time the tests run.
create function tests.noon() returns timestamptz language sql stable as $$
  select ((now() at time zone 'America/Toronto')::date + time '12:00') at time zone 'America/Toronto'
$$;
insert into public.push_tokens (user_id, token, platform)
values (tests.u(3), 'ExponentPushToken[tester3token]', 'ios');
select is((select reason from private.would_send((select id from public.notifications where recipient_id = tests.u(3)
                                                   and type = 'challenge_reply'), tests.noon())), 'ok', 'the first push goes');
update public.notifications set pushed_at = tests.noon() where recipient_id = tests.u(3) and type = 'challenge_reply';
select is((select reason from private.would_send((select id from public.notifications where recipient_id = tests.u(3)
                                                   and type = 'challenge_reply'), tests.noon() + interval '10 minutes')), 'rate_limited', 'then it waits');

-- Feed: blocks, pauses, live and final -----------------------------------------------------------------------------
select tests.block(3, 2);
select is(tests.has_card(3, tests.id('ev1')), false, 'a block with a competitor hides it from a follower');
insert into private.account_pauses (user_id, reason, staff_note, starts_at)
values (tests.u(2), 'spam', 'Test', now() - interval '1 minute');
select is(tests.has_card(4, tests.id('ev1')), false, 'a paused competitor hides it too');
delete from private.account_pauses where user_id = tests.u(2);
select is(tests.has_card(4, tests.id('ev1')), true, 'back once restored');

select tests.go_live(tests.id('ev1'), 1, 2);
select is((select row(x.stage, x.situation, x.reason)::text from tests.ccard(1, tests.id('ev1')) as x(card text, title text, reason text, stage text, situation text, href text, event jsonb, position integer)),
          row('live', 'live', 'Live · you''re in it')::text, 'live: the live situation');
select tests.finish(tests.id('ev1'), 1, 2, 1300, 1400);
select is((select row(x.stage, x.situation, x.event ->> 'winner_side')::text from tests.ccard(4, tests.id('ev1')) as x(card text, title text, reason text, stage text, situation text, href text, event jsonb, position integer)),
          row('complete', 'after', 'a')::text, 'final: the after situation, with the winner');
update public.challenge_events set completed_at = now() - interval '3 days' where id = tests.id('ev1');
select is(tests.has_card(4, tests.id('ev1')), false, 'gone two days after the result');

select * from finish();
rollback;
