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

-- Make This a Game: rules-based, opt-in, idempotent, crew-only.
select no_plan();

select tests.keep('crew', tests.make_crew(1, array[2, 3, 4]));

-- A conversation with a sport, a day, hours and interest.
select tests.login(1);
select public.send_message(gen_random_uuid(), 'Anyone up for football Saturday morning?', tests.id('crew'));
select tests.login(2);
select public.send_message(gen_random_uuid(), 'In, if it''s before 11.', tests.id('crew'));
select tests.login(3);
select public.send_message(gen_random_uuid(), 'Same. Test Pitch?', tests.id('crew'));

select tests.login(4);
select is((select count(*)::integer from public.chat_suggestions(tests.id('crew'))), 1, 'Ojoro noticed a plan');
select is((select sport_id from public.chat_suggestions(tests.id('crew'))), 'football', 'the sport');
select is((select interested_count from public.chat_suggestions(tests.id('crew'))), 3, 'three people showed interest');
select ok((select bool_and(to_char(t at time zone 'America/Toronto', 'HH24:MI') in ('09:00', '10:00', '10:30'))
                 and bool_and(extract(isodow from t at time zone 'America/Toronto') = 6)
                 and count(*) between 1 and 3
          from public.chat_suggestions(tests.id('crew')) s, unnest(s.proposed_times) t),
  '"Saturday morning … before 11" proposes 9:00, 10:00 and 10:30 on a Saturday (those still ahead)');
select is((select place_names from public.chat_suggestions(tests.id('crew'))), array['Test Pitch'], 'the place named');
select is((select count(*)::integer from public.plans where crew_id = tests.id('crew')), 0,
  'nothing is created until someone taps');
select tests.keep('s', (select id from public.chat_suggestions(tests.id('crew'))));
select is((select count(*)::integer from public.chat_suggestions where id = tests.id('s')), 1, 'members read the row');

-- No message words leave the chat: analytics carry facts only.
select tests.logout();
select is((select count(*)::integer from private.analytics_events
           where name in ('message_sent', 'chat_suggestion_created') and payload::text ilike '%saturday%'), 0,
  'message words are never logged');
select is((select count(*)::integer from public.chat_suggestions s where s.id = tests.id('s')
           and to_jsonb(s)::text ilike '%anyone up%'), 0, 'nor stored in the suggestion');

-- Outsiders.
select tests.login(9);
select is((select count(*)::integer from public.chat_suggestions where id = tests.id('s')), 0, 'outsiders see nothing');
select throws_ok($$select * from public.chat_suggestions(tests.id('crew'))$$, 'P0001', 'crew_not_found', 'or through the RPC');
select throws_ok($$select public.make_this_a_game(tests.id('s'), p_idempotency_key => gen_random_uuid())$$,
  'P0001', 'suggestion_not_found', 'and cannot make the game');
select throws_ok($$select public.dismiss_suggestion(tests.id('s'))$$, 'P0001', 'suggestion_not_found', 'or dismiss it');

-- NOT NOW hides it for you only.
select tests.login(2);
select ok(public.dismiss_suggestion(tests.id('s')), 'dismiss');
select ok(public.dismiss_suggestion(tests.id('s')), 'dismiss twice is fine');
select is((select count(*)::integer from public.chat_suggestions(tests.id('crew'))), 0, 'gone for the person who dismissed it');
select tests.login(3);
select is((select count(*)::integer from public.chat_suggestions(tests.id('crew'))), 1, 'still there for others');
select tests.login(2);
select public.send_message(gen_random_uuid(), 'Who''s in?', tests.id('crew'));
select is((select count(*)::integer from public.chat_suggestions(tests.id('crew'))), 0,
  'more chat about the same plan does not bring it back');

-- MAKE THIS A GAME: one plan, idempotent, crew audience, time poll.
select tests.login(3);
select throws_ok($$select public.make_this_a_game(tests.id('s'))$$, 'P0001', 'idempotency_key_required', 'needs a key');
select tests.keep('k', gen_random_uuid());
select tests.keep('plan', (public.make_this_a_game(tests.id('s'), p_idempotency_key => tests.id('k'))).plan_id);
select is((public.make_this_a_game(tests.id('s'), p_idempotency_key => tests.id('k'))).plan_id, tests.id('plan'),
  'retried with the key: the same plan');
select is((public.make_this_a_game(tests.id('s'), p_idempotency_key => tests.id('k'))).created, true,
  'and exactly the first result');
select tests.login(4);
select is((public.make_this_a_game(tests.id('s'), p_idempotency_key => gen_random_uuid())).created, false,
  'a second person tapping gets the same plan, not a new one');
select tests.logout();
select is((select count(*)::integer from public.plans where crew_id = tests.id('crew')), 1, 'exactly one plan');
select is((select audience::text || '/' || source::text from public.plans where id = tests.id('plan')), 'crew/chat',
  'a crew plan from chat');
select is((select member_count from public.plans where id = tests.id('plan')), 1, 'only the tapper is in (nobody silently)');
select is((select host_id from public.plans where id = tests.id('plan')), tests.u(3), 'the tapper hosts');
select is((select count(*)::integer from public.plan_time_options where plan_id = tests.id('plan')),
  (select cardinality(proposed_times) from public.chat_suggestions where id = tests.id('s')), 'the proposed times become the poll');
select is((select status::text from public.chat_suggestions where id = tests.id('s')), 'accepted', 'the suggestion is accepted');
select is((select count(*)::integer from public.messages where crew_id = tests.id('crew') and kind = 'system'), 1,
  'the chat says who tapped');
select is((select count(*)::integer from public.notifications where plan_id = tests.id('plan') and type = 'crew_poll'), 3,
  'the rest of the crew is asked to vote');

-- Crew-only visibility; crew members vote without joining.
select tests.login(9);
select is((select count(*)::integer from public.plan_cards where id = tests.id('plan')), 0, 'outsiders cannot see it');
select throws_ok($$select public.im_down(tests.id('plan'), gen_random_uuid())$$, 'P0001', 'plan_not_found',
  'or join it');
select tests.login(2);
select is((select count(*)::integer from public.plan_cards where id = tests.id('plan')), 1, 'crew members see it');
select is((select count(*)::integer from public.vote_time(tests.id('plan'),
            (select id from public.plan_time_options where plan_id = tests.id('plan') order by starts_at limit 1))
           where is_mine), 1, 'and vote in its poll');
select is((select section from public.my_notifications() where type = 'crew_poll'), 'today',
  'after voting the poll no longer needs you');
select is((public.im_down(tests.id('plan'), gen_random_uuid())).member_count, 2, 'and join with I''M DOWN');

-- Expired suggestions can't be made.
select tests.logout();
insert into public.chat_suggestions (crew_id, sport_id, day_label, day_key, proposed_times, expires_at)
values (tests.id('crew'), 'football', 'tonight', 'football:old', array[now() + interval '3 hours'], now() - interval '1 minute')
returning tests.keep('old', id);
select tests.login(1);
select throws_ok($$select public.make_this_a_game(tests.id('old'), p_idempotency_key => gen_random_uuid())$$,
  'P0001', 'suggestion_expired', 'an expired suggestion is refused');

-- Too little to go on: no suggestion.
select tests.keep('quiet', tests.make_crew(5, array[6]));
select tests.login(5);
select public.send_message(gen_random_uuid(), 'Nice game last week.', tests.id('quiet'));
select public.send_message(gen_random_uuid(), 'Thanks for the bibs.', tests.id('quiet'));
select is((select count(*)::integer from public.chat_suggestions(tests.id('quiet'))), 0,
  'no day, no plan: no suggestion');

-- Times: "tomorrow 7" is evening; an explicit time is used.
select tests.keep('evening', tests.make_crew(7, array[8]));
select tests.login(7);
select public.send_message(gen_random_uuid(), 'Football tomorrow 7?', tests.id('evening'));
select tests.login(8);
select public.send_message(gen_random_uuid(), 'I''m in', tests.id('evening'));
select is((select to_char(proposed_times[1] at time zone 'America/Toronto', 'HH24:MI')
           from public.chat_suggestions(tests.id('evening'))), '19:00', '"tomorrow 7" means 7 PM');

select * from finish();
rollback;
