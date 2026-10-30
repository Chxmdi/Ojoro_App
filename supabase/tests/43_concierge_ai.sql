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


-- Step 8 CONCIERGE: the AI Concierge's server side (docs/CONCIERGE_CONTRACT.md).
select plan(30);

-- The shared parse ----------------------------------------------------------------------------------
select is((select minutes from private.concierge_parse('I have 90 minutes and want to meet people')), 90, 'reads 90 minutes');
select ok((select social from private.concierge_parse('I have 90 minutes and want to meet people')), 'reads meet people');
select is((select minutes from private.concierge_parse('got 2h')), 120, 'reads 2h');
select is((select minutes from private.concierge_parse('an hour free')), 60, 'reads an hour');
select is((select sport_id from private.concierge_parse('up for some hoops tonight')), 'basketball', 'hoops is basketball');
select is((select sport_id from private.concierge_parse('beach volleyball later')), 'beach_volleyball', 'longest word wins');
select ok((select not has_text and minutes is null and sport_id is null from private.concierge_parse(null)), 'nothing from nothing');

-- Data: u(1) played with u(2). u(2) hosts football at Test Pitch in 2 h; u(3) hosts a run; u(4)'s
-- football plan has u(5), who blocked u(1); u(7)'s plan is invite-only.
select tests.connect(1, 2);
select tests.keep('football', tests.make_plan(2, 8, '2 hours'));
select tests.keep('run', tests.make_plan(3, 8, '3 hours'));
update public.plans set sport_id = 'running' where id = tests.id('run');
select tests.keep('blocked', tests.make_plan(4, 8, '2 hours'));
insert into public.plan_members (plan_id, user_id, via) values (tests.id('blocked'), tests.u(5), 'im_down');
update public.plans set member_count = 2 where id = tests.id('blocked');
select tests.login(5);
select public.block_user(tests.u(1));
select tests.logout();
select tests.keep('secret', tests.make_plan(7, 8, '2 hours', 'invite_only'));

-- The rules stub keeps its contract -------------------------------------------------------------------
select tests.login(1);
select ok((select reasons[1] from public.concierge_suggest('I have 90 minutes and want to play football', null, null, 5) where plan_id = tests.id('football')) = 'it fits your 90 minutes',
  'concierge_suggest still reads minutes first');
select ok(exists (select 1 from public.concierge_suggest('a run later', null, null, 5) where plan_id = tests.id('run')),
  'concierge_suggest still reads a sport');
select ok(not exists (select 1 from public.concierge_suggest('a run later', null, null, 5) where plan_id = tests.id('football')),
  'and filters by it');

-- Candidates ------------------------------------------------------------------------------------------
create temp table c as select public.concierge_candidates('up for a run later', 8) as j;
select is((select j #>> '{parse,sport_id}' from c), 'running', 'candidates carry the parse');
select ok((select (r ->> 'matched')::boolean from c, jsonb_array_elements(j -> 'rows') r
            where r ->> 'plan_id' = tests.id('run')::text), 'the run matches');
select ok((select not (r ->> 'matched')::boolean from c, jsonb_array_elements(j -> 'rows') r
            where r ->> 'plan_id' = tests.id('football')::text), 'football fills up, marked not matched');
select ok((select bool_and(not (r ->> 'matched')::boolean) from c, jsonb_array_elements(j -> 'rows') with ordinality t(r, i)
            where i > (select count(*) from c, jsonb_array_elements(j -> 'rows') r2 where (r2 ->> 'matched')::boolean)),
  'matched rows come first');
select ok(not exists (select 1 from c, jsonb_array_elements(j -> 'rows') r
                       where r ->> 'plan_id' in (tests.id('blocked')::text, tests.id('secret')::text)),
  'never a plan with a block or one you cannot see');
select ok(not exists (select 1 from c, jsonb_array_elements(j -> 'rows') r, jsonb_object_keys(r) k
                       where k not in ('kind', 'plan_id', 'sport_id', 'sport_name', 'title', 'starts_at',
                                       'duration_minutes', 'place_id', 'place_name', 'place_area', 'distance_km',
                                       'member_count', 'capacity', 'played_with_count', 'demand_count',
                                       'window_start', 'window_end', 'reasons', 'reason', 'matched')),
  'only Suggestion columns: no people, no points');
select ok((select jsonb_array_length(j -> 'rows') <= 2 from (select public.concierge_candidates('football', 2) as j) x),
  'the limit holds');
select tests.logout();
select is((select count(*)::integer from private.analytics_events where name = 'concierge_suggested' and user_id = tests.u(1)
            and occurred_at >= now()), 3, 'candidates log nothing themselves (only the three stub calls did)');
select tests.login(1);
select throws_ok($$select public.concierge_candidates(repeat('a', 501))$$, 'P0001', 'invalid_argument',
  'over 500 characters is refused');

-- Gate and record are the Edge Function's only -------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'public.concierge_ai_gate(uuid)', 'execute'), 'people cannot call the gate');
select ok(not has_function_privilege('authenticated', 'public.concierge_ai_record(uuid,jsonb)', 'execute'), 'nor the log');
select ok(not has_function_privilege('anon', 'public.concierge_candidates(text,integer)', 'execute'), 'anon cannot read candidates');
select tests.logout();
select throws_ok($$select public.concierge_ai_gate(tests.u(1))$$, 'P0001', 'not_authenticated',
  'the gate checks the service role even if granted');

create function tests.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end;
$$;
grant usage on schema tests to service_role;
select tests.as_service();
select ok((select bool_and((public.concierge_ai_gate(tests.u(1)) ->> 'allowed')::boolean) from generate_series(1, 6)),
  'six AI answers a minute');
select is(public.concierge_ai_gate(tests.u(1)) ->> 'reason', 'per_minute', 'the seventh is held back');
select ok((public.concierge_ai_gate(tests.u(2)) ->> 'allowed')::boolean, 'per person');
select tests.logout();
update private.concierge_ai_calls set called_at = now() - interval '2 minutes' where user_id = tests.u(1);
insert into private.concierge_ai_calls (user_id, called_at)
select tests.u(1), now() - interval '2 hours' from generate_series(1, 94);
select tests.as_service();
select is(public.concierge_ai_gate(tests.u(1)) ->> 'reason', 'per_day', 'and 100 a day');
select ok((public.concierge_ai_gate(tests.u(1)) ->> 'retry_after_seconds')::integer > 0, 'with when to try again');

select public.concierge_ai_record(tests.u(1), jsonb_build_object(
  'source', 'ai', 'outcome', 'match', 'candidates', 3, 'has_text', true,
  'text', 'I have 90 minutes', 'why', 'it fits your 90 minutes', 'model', repeat('m', 60)));
select tests.logout();
select is((select payload - 'model' from private.analytics_events where name = 'concierge_ai_decided' and user_id = tests.u(1)
           order by id desc limit 1),
  '{"source": "ai", "outcome": "match", "candidates": 3, "has_text": true}'::jsonb,
  'the log keeps the allowed facts and never the words');
select is((select char_length(payload ->> 'model') from private.analytics_events where name = 'concierge_ai_decided'
           and user_id = tests.u(1) order by id desc limit 1), 40, 'strings are cut short');

select * from finish();
rollback;
