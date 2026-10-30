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

-- Step 6 (Communities): Crew Home (Momentum, free tonight, unread, the Down For board, crew vs crew,
-- memories) and Rituals.
select no_plan();

select tests.keep('crew', tests.make_crew(1, array[1, 2, 3, 4]));

-- Members only ---------------------------------------------------------------------------------------------
select tests.login(5);
select throws_ok(format($$select * from public.crew_home(%L)$$, tests.id('crew')), 'P0001', 'crew_not_found',
  'crew_home: members only');
select throws_ok(format($$select * from public.crew_down_for(%L)$$, tests.id('crew')), 'P0001', 'crew_not_found',
  'crew_down_for: members only');
select throws_ok(format($$select * from public.crew_memories(%L)$$, tests.id('crew')), 'P0001', 'crew_not_found',
  'crew_memories: members only');
select throws_ok(format($$select public.report('crew', %L, 'spam')$$, tests.id('crew')), 'P0001', 'subject_not_found',
  'report a crew: only when you are in it');

-- Momentum --------------------------------------------------------------------------------------------------
select tests.login(1);
select is((select cardinality(weeks) from public.crew_home(tests.id('crew'))), 8, 'eight weeks of rhythm');
select is((select momentum || ' ' || streak_weeks from public.crew_home(tests.id('crew'))), 'starting 0',
  'no sessions yet: starting, no streak');
select ok(public.report('crew', tests.id('crew'), 'spam') is not null, 'report a crew you are in');

-- A game two crew mates played together a week ago counts as a session.
select tests.logout();
select tests.keep('game', tests.connect(1, 2));
select tests.login(1);
select is((select weeks[7] + weeks[8] from public.crew_home(tests.id('crew'))), 1, 'the game counts as a session');
select is((select momentum from public.crew_home(tests.id('crew'))), 'on_rhythm', 'met the rhythm: on rhythm');

select tests.logout();
select is((select streak || ' ' || state from private.crew_momentum(array[1, 1, 0, 2, 2, 2, 2, 0], 2)), '4 on_rhythm',
  'streak: whole weeks met, ending last week; the unfinished week never breaks it');
select is((select streak || ' ' || state from private.crew_momentum(array[1, 1, 0, 2, 2, 2, 2, 3], 2)), '5 on_rhythm',
  'this week counts once it is met');
select is((select streak || ' ' || state from private.crew_momentum(array[2, 0, 0, 0, 0, 0, 0, 0], 2)), '0 comeback',
  'missed weeks after meeting it: a comeback, not a loss');
select is((select state from private.crew_momentum(array[0, 0, 0, 0, 0, 0, 0, 0], 1)), 'starting', 'never met: starting');

select tests.login(2);
select throws_ok(format($$select public.set_crew_rhythm(%L, 2)$$, tests.id('crew')), 'P0001', 'not_crew_admin',
  'members cannot set the rhythm');
select tests.login(1);
select is(public.set_crew_rhythm(tests.id('crew'), 2), 2, 'the owner sets the rhythm');
select is(public.set_crew_rhythm(tests.id('crew'), 2), 2, 'again: same state');
select throws_ok(format($$select public.set_crew_rhythm(%L, 9)$$, tests.id('crew')), 'P0001', 'invalid_argument',
  '1 to 7 a week');
select is((select rhythm_per_week from public.crew_home(tests.id('crew'))), 2, 'crew_home shows the rhythm');

-- Free tonight (overlap only) --------------------------------------------------------------------------------
select tests.logout();
insert into public.availability_slots (user_id, day_of_week, part)
select tests.u(n), d, 'evening' from unnest(array[1, 2, 3, 4]) n, generate_series(1, 7) d;
update public.privacy_settings set availability_visibility = 'only_me' where user_id = tests.u(3);
select tests.block(1, 4);
select tests.login(1);
select is((select free_tonight from public.crew_home(tests.id('crew'))), 1,
  'free tonight: crew mates who share with crews; not "only me", not across a block');
select is((select array_agg(user_id) from public.crew_free_tonight(tests.id('crew'))), array[tests.u(2)],
  'names: Tester 2 only');
select tests.login(4);
select is((select count(*)::integer from public.crew_free_tonight(tests.id('crew'))), 1,
  'the blocked person does not see the blocker either');
select tests.logout();
update public.privacy_settings set availability_visibility = 'friends' where user_id = tests.u(3);
select tests.login(1);
select is((select count(*)::integer from public.crew_free_tonight(tests.id('crew'))), 1,
  '"friends" needs a game together');

-- Unread chat -------------------------------------------------------------------------------------------------
select tests.logout();
insert into public.messages (crew_id, sender_id, body, created_at)
select tests.id('crew'), tests.u(n), 'hello ' || n, clock_timestamp() + interval '1 millisecond' * o
from unnest(array[2, 2, 3, 4]) with ordinality as x(n, o);
select tests.login(1);
select is((select unread_count from public.crew_home(tests.id('crew'))), 3, 'unread: from others, never from blocked people');
select isnt(public.mark_crew_chat_read(tests.id('crew')), null, 'mark read');
select is((select unread_count from public.crew_home(tests.id('crew'))), 0, 'all read');
select ok(public.mark_crew_chat_read(tests.id('crew'), now() - interval '1 day') >= now() - interval '1 minute',
  'the read mark never moves back');

-- Down For board ----------------------------------------------------------------------------------------------
select tests.logout();
insert into public.intent_signals (user_id, sport_id, window_start, window_end, expires_at, audience, radius_km,
                                   area_lat, area_lng, created_at)
values (tests.u(2), 'football', now() + interval '1 day', now() + interval '1 day 3 hours', now() + interval '20 hours',
        'friends', 5, 45.52, -73.58, now() - interval '2 hours'),
       (tests.u(3), 'football', now() + interval '1 day 1 hour', now() + interval '1 day 2 hours',
        now() + interval '20 hours', 'friends', 5, 45.52, -73.58, now() - interval '1 hour');
select tests.keep('sig2', (select id from public.intent_signals where user_id = tests.u(2) and status = 'active'));
select tests.login(1);
select is((select count(*)::integer from public.crew_down_for(tests.id('crew'))), 1, 'overlapping signals are one row');
select is((select signal_id::text || ' ' || down_count from public.crew_down_for(tests.id('crew'))),
  tests.id('sig2')::text || ' 2', 'led by the earliest; 2 down');
select tests.keep('key', gen_random_uuid());
select ok((public.join_down_for(tests.id('sig2'), tests.id('key'))).created, 'I''M DOWN on a crew mate''s Down For');
select is((select down_count || ' ' || i_am_down from public.crew_down_for(tests.id('crew'))), '3 true',
  'now 3 down, you included');
select is((public.join_down_for(tests.id('sig2'), tests.id('key'))).signal_id,
  (select id from public.intent_signals where user_id = tests.u(1)), 'retry with the key: the same result');
select is((select count(*)::integer from public.intent_signals where user_id = tests.u(1)), 1, 'one signal, not two');
select tests.login(2);
select throws_ok(format($$select public.join_down_for(%L, gen_random_uuid())$$, tests.id('sig2')), 'P0001',
  'invalid_argument', 'not on your own signal');
select tests.login(6);
select throws_ok(format($$select public.join_down_for(%L, gen_random_uuid())$$, tests.id('sig2')), 'P0001',
  'signal_not_found', 'a friends-only signal from a stranger is not visible');

-- Rituals ----------------------------------------------------------------------------------------------------
select tests.login(2);
select throws_ok(format($$select public.create_ritual(gen_random_uuid(), 'football', 'Thursday football', 4, '19:30', 10, %L)$$,
  tests.id('crew')), 'P0001', 'not_crew_admin', 'members cannot start a Ritual');
select tests.login(1);
select throws_ok(format($$select public.create_ritual(gen_random_uuid(), 'football', 'Big game', 4, '19:30', 20, %L)$$,
  tests.id('crew')), 'P0001', 'capacity_invalid', 'crew Rituals hold 2 to 12');
select throws_ok(format($$select public.create_ritual(gen_random_uuid(), 'football', 'Two homes', 4, '19:30', 10, %L, %L)$$,
  tests.id('crew'), tests.id('crew')), 'P0001', 'invalid_argument', 'one of crew or clan');
-- Two days from now (local), 19:00: inside the 6-day lead window, so the week is prefilled.
select tests.keep('rkey', gen_random_uuid());
select tests.keep('rit', (public.create_ritual(tests.id('rkey'), 'football', 'Pitch night',
  extract(isodow from ((now() at time zone 'America/Toronto')::date + 2))::integer, '19:00', 8, tests.id('crew'))).id);
select is((public.create_ritual(tests.id('rkey'), 'football', 'Pitch night', 1, '19:00', 8, tests.id('crew'))).id,
  tests.id('rit'), 'retry with the key: the same Ritual');
select tests.keep('wk', (select week_plan_id from public.crew_rituals(tests.id('crew')) where ritual_id = tests.id('rit')));
select isnt(tests.id('wk'), null, 'the week is prefilled');
select tests.logout();
select is((select audience::text || ' ' || source::text || ' ' || member_count || ' ' || (crew_id = tests.id('crew'))
           from public.plans where id = tests.id('wk')), 'crew ritual 1 true',
  'a crew plan from the Ritual: the host is in, nobody else yet');
select tests.login(2);
select is((public.im_down(tests.id('wk'), gen_random_uuid())).member_count, 2, 'crew mates still tap I''M DOWN');
select is((select week_member_count || '/' || week_capacity || ' ' || week_i_am_in from public.crew_rituals(tests.id('crew'))),
  '2/8 true', 'THIS WEEK · 2 / 8');
select is((select next_ritual_id from public.crew_home(tests.id('crew'))), tests.id('rit'), 'NEXT is the Ritual''s week');
select tests.login(3);
select throws_ok(format($$select public.skip_ritual_week(%L)$$, tests.id('rit')), 'P0001', 'not_crew_admin',
  'members cannot skip the week');
select tests.login(1);
select ok((public.skip_ritual_week(tests.id('rit'))).skipped, 'SKIP A WEEK');
select ok((public.skip_ritual_week(tests.id('rit'))).skipped, 'again: same state');
select tests.logout();
select is((select status::text from public.plans where id = tests.id('wk')), 'cancelled', 'the week''s plan is called off');
select tests.login(1);
select is((select week_skipped::text || ' ' || coalesce(week_plan_id::text, 'none') from public.crew_rituals(tests.id('crew'))),
  'true none', 'crew_rituals: skipped');
select tests.keep('wk2', (public.skip_ritual_week(tests.id('rit'), null, false)).plan_id);
select isnt(tests.id('wk2'), tests.id('wk'), 'put back: a new plan');
select is((select week_plan_id from public.crew_rituals(tests.id('crew'))), tests.id('wk2'), 'on the board again');
select tests.logout();
update public.plans set status = 'game_on' where id = tests.id('wk2');
select tests.login(1);
select throws_ok(format($$select public.skip_ritual_week(%L)$$, tests.id('rit')), 'P0001', 'ritual_week_locked',
  'GAME ON weeks are locked');
select throws_ok(format($$select public.skip_ritual_week(%L, (now() at time zone 'America/Toronto')::date + 1)$$, tests.id('rit')), 'P0001',
  'invalid_argument', 'only the Ritual''s weekday');

select is(public.set_ritual_paused(tests.id('rit'), true)::text, 'paused', 'pause');
select is(public.set_ritual_paused(tests.id('rit'), true)::text, 'paused', 'pause again: same state');
select is((select status::text from public.crew_rituals(tests.id('crew'))), 'paused', 'PAUSED on Crew Home');
select is(public.set_ritual_paused(tests.id('rit'), false)::text, 'active', 'resume');
select is((public.update_ritual(tests.id('rit'), p_title => 'Floodlit night')).title, 'Floodlit night', 'edit');
select tests.login(2);
select throws_ok(format($$select public.update_ritual(%L, p_title => 'Mine')$$, tests.id('rit')), 'P0001',
  'not_crew_admin', 'members cannot edit');
select tests.login(1);
select is(public.end_ritual(tests.id('rit'))::text, 'ended', 'end it');
select is((select count(*)::integer from public.crew_rituals(tests.id('crew'))), 0, 'ended Rituals leave Crew Home');
select throws_ok(format($$select public.set_ritual_paused(%L, true)$$, tests.id('rit')), 'P0001', 'ritual_not_found',
  'ended is for good');

-- Limit: 3 active or paused a crew.
select tests.logout();
create function tests.dow(k integer) returns integer language sql stable
as $$ select extract(isodow from ((now() at time zone 'America/Toronto')::date + k))::integer $$;
grant execute on function tests.dow(integer) to authenticated;
select tests.login(1);
select public.create_ritual(gen_random_uuid(), 'football', 'One', tests.dow(4), '19:00', 8, tests.id('crew'), p_lead_days => 1);
select public.create_ritual(gen_random_uuid(), 'football', 'Two', tests.dow(5), '19:00', 8, tests.id('crew'), p_lead_days => 1);
select tests.keep('r3', (public.create_ritual(gen_random_uuid(), 'running', 'Three', tests.dow(3), '19:00', 8, tests.id('crew'),
  p_lead_days => 1)).id);
select is((select count(*)::integer from public.ritual_occurrences o where o.ritual_id = tests.id('r3')), 0,
  'not inside the lead window yet: nothing on the board');
select throws_ok(format($$select public.create_ritual(gen_random_uuid(), 'football', 'Four', 5, '19:00', 8, %L)$$,
  tests.id('crew')), 'P0001', 'ritual_limit', '3 a crew');

-- The job prefills a week once it's inside the lead window.
select tests.logout();
update public.rituals set lead_days = 13 where id = tests.id('r3');
select ok(private.ritual_tick() >= 1, 'ritual_tick prefills due weeks');
select isnt((select o.plan_id from public.ritual_occurrences o where o.ritual_id = tests.id('r3') limit 1), null,
  'the week is on the board');
select is(private.ritual_tick(), 0, 'and only once');

-- Crew vs crew ------------------------------------------------------------------------------------------------
select tests.keep('other', tests.make_crew(7, array[7, 8], 'Other Crew'));
select tests.login(1);
select tests.keep('cco', (public.create_call_out(gen_random_uuid(), 'football', '5 a side', 'score', now() + interval '5 days',
  p_challenger_crew_id => tests.id('crew'), p_opponent_crew_id => tests.id('other'))).call_out_id);
select tests.login(7);
select public.accept_call_out(tests.id('cco'), gen_random_uuid());
select tests.login(2);
select is((select opponent_name || ' ' || stage || ' ' || our_side from public.crew_versus(tests.id('crew'))),
  'Other Crew accepted a', 'crew vs crew: the opponent, the stage, our side');
select is((select opponent_name || ' ' || meetings || ' ' || (next_event_id is not null) from public.crew_rivalries(tests.id('crew'))),
  'Other Crew 0 true', 'the rivalry with the next event');

-- Memories ---------------------------------------------------------------------------------------------------
select tests.logout();
insert into public.recaps (activity_id, sport_id, occurred_at, duration_minutes, played_count, team_a_label, team_b_label,
                           team_a_score, team_b_score)
values (tests.id('game'), 'football', now() - interval '7 days', 90, 2, 'Lights', 'Darks', 5, 4);
insert into public.moments (activity_id, author_id, storage_path, alt_text, caption)
values (tests.id('game'), tests.u(2), tests.id('game') || '/' || tests.u(2) || '/a.jpg', 'Team photo', 'Soaked');
select tests.login(1);
select is((select moment_path is not null and i_played from public.crew_memories(tests.id('crew'))), true,
  'players see the photo');
select tests.login(3);
select is((select coalesce(moment_path, 'none') || ' ' || team_a_score || '-' || team_b_score
           from public.crew_memories(tests.id('crew'))), 'none 5-4',
  'crew mates who did not play get the recap line, not the photo');

select * from finish();
rollback;
