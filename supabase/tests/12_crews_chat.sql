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

-- Crews and chat: members only, removal rules, rate limits, blocks, reports.
select no_plan();

select tests.connect(1, 2);
select tests.connect(1, 3);
select tests.connect(1, 6);

-- create_crew: the owner adds people they've played with, nobody else.
select tests.login(1);
select tests.keep('crew', (public.create_crew(gen_random_uuid(), 'Thursday FC', 'football', array[tests.u(2), tests.u(3)])).id);
select is((select member_count from public.crews where id = tests.id('crew')), 3, 'create_crew adds the owner and two members');
select is((select role::text from public.crew_members where crew_id = tests.id('crew') and user_id = tests.u(1)), 'owner',
  'the creator owns the crew');
select throws_ok($$select public.create_crew(gen_random_uuid(), 'Other', null, array[tests.u(9)])$$,
  'P0001', 'crew_member_not_allowed', 'only people you have played with can be added');
select throws_ok($$select public.create_crew(gen_random_uuid(), '', null, '{}')$$,
  'P0001', 'invalid_argument', 'a crew needs a name');

-- Idempotent create.
select tests.keep('crew_key', gen_random_uuid());
select is((public.create_crew(tests.id('crew_key'), 'Same', null, '{}')).id,
          (public.create_crew(tests.id('crew_key'), 'Same', null, '{}')).id, 'create_crew retried returns the same crew');

-- Members only.
select tests.login(4);
select is((select count(*)::integer from public.crews where id = tests.id('crew')), 0, 'a non-member sees no crew');
select is((select count(*)::integer from public.crew_members where crew_id = tests.id('crew')), 0,
  'a non-member sees no crew members');
select throws_ok($$select * from public.crew_messages(tests.id('crew'))$$, 'P0001', 'crew_not_found',
  'a non-member cannot read the chat');
select throws_ok($$select public.send_message(gen_random_uuid(), 'hi', tests.id('crew'))$$, 'P0001', 'crew_not_found',
  'a non-member cannot send to the chat');
select throws_ok($$select * from public.crew_view(tests.id('crew'))$$, 'P0001', 'crew_not_found',
  'a non-member gets no crew view');
select tests.login(2);
select is((select count(*)::integer from public.crew_members where crew_id = tests.id('crew')), 3, 'members see members');
select is((select count(*)::integer from public.crew_roster(tests.id('crew'))), 3, 'crew_roster lists members');

-- Invite codes: owners and admins only; a block reads as an invalid code.
select throws_ok($$select public.crew_invite_code(tests.id('crew'))$$, 'P0001', 'not_crew_admin',
  'a member cannot see the invite code');
select tests.login(1);
select ok(public.crew_invite_code(tests.id('crew')) ~ '^[A-Z0-9]{8}$', 'the owner gets an 8-character code');
select tests.login(5);
select is(public.join_crew(tests.crew_code(tests.id('crew'))), tests.id('crew'),
  'joining with the code works');
select is(public.join_crew(tests.crew_code(tests.id('crew'))), tests.id('crew'),
  'joining again is a no-op');
select is((select member_count from public.crews where id = tests.id('crew')), 4, 'the count went up once');
select throws_ok($$select public.join_crew('NOPENOPE')$$, 'P0001', 'invite_code_invalid', 'a wrong code is refused');
select tests.block(2, 7);
select tests.login(7);
select throws_ok($$select public.join_crew(tests.crew_code(tests.id('crew')))$$,
  'P0001', 'invite_code_invalid', 'someone with a block in the crew cannot join, and is not told why');

-- Removal rules.
select tests.login(2);
select throws_ok($$select public.remove_crew_member(tests.id('crew'), tests.u(3))$$, 'P0001', 'not_crew_admin',
  'members cannot remove members');
select throws_ok($$select public.remove_crew_member(tests.id('crew'), tests.u(1))$$, 'P0001', 'cannot_remove_owner',
  'nobody removes the owner');
select tests.login(1);
select is(public.set_crew_role(tests.id('crew'), tests.u(2), 'admin')::text, 'admin', 'the owner makes an admin');
select tests.login(2);
select ok(public.remove_crew_member(tests.id('crew'), tests.u(5)), 'an admin removes a member');
select is((select count(*)::integer from public.crew_members where crew_id = tests.id('crew') and user_id = tests.u(5)), 0,
  'removed');
select tests.login(1);
select is(public.set_crew_role(tests.id('crew'), tests.u(3), 'admin')::text, 'admin', 'a second admin');
select tests.login(2);
select throws_ok($$select public.remove_crew_member(tests.id('crew'), tests.u(3))$$, 'P0001', 'not_crew_admin',
  'admins cannot remove admins');
select tests.login(1);
select throws_ok($$select public.leave_crew(tests.id('crew'))$$, 'P0001', 'owner_must_transfer',
  'the owner hands over before leaving');
select ok(public.transfer_crew_ownership(tests.id('crew'), tests.u(2)), 'ownership moves');
select is((select role::text from public.crew_members where crew_id = tests.id('crew') and user_id = tests.u(1)), 'admin',
  'the old owner becomes an admin');
select ok(public.leave_crew(tests.id('crew')), 'then they can leave');
select ok(public.leave_crew(tests.id('crew')), 'leaving twice is a no-op');
select is((select count(*)::integer from public.crews where id = tests.id('crew')), 0, 'and no longer see the crew');

-- Chat.
select tests.login(2);
select tests.keep('msg_key', gen_random_uuid());
select tests.keep('m1', (public.send_message(tests.id('msg_key'), 'Who is in for Saturday?', tests.id('crew'))).id);
select is((public.send_message(tests.id('msg_key'), 'Who is in for Saturday?', tests.id('crew'))).id, tests.id('m1'),
  'send_message retried returns the same message');
select is((select count(*)::integer from public.messages where crew_id = tests.id('crew')), 1, 'and sends it once');
select throws_ok($$select public.send_message(gen_random_uuid(), '   ', tests.id('crew'))$$, 'P0001', 'message_invalid',
  'an empty message is refused');
select throws_ok($$select public.send_message(gen_random_uuid(), repeat('a', 1001), tests.id('crew'))$$, 'P0001',
  'message_invalid', 'over 1000 characters is refused');
select throws_ok($$select public.send_message(gen_random_uuid(), 'x', tests.id('crew'), gen_random_uuid())$$, 'P0001',
  'invalid_argument', 'one thread at a time');
select tests.login(3);
select is((select count(*)::integer from public.crew_messages(tests.id('crew'))), 1, 'members read the chat');

-- Rate limit: 20 a minute.
select tests.login(3);
select lives_ok($$select public.send_message(gen_random_uuid(), 'msg ' || n, tests.id('crew')) from generate_series(1, 20) n$$,
  '20 messages in a minute are fine');
select throws_ok($$select public.send_message(gen_random_uuid(), 'one more', tests.id('crew'))$$, 'P0001',
  'message_rate_limited', 'the 21st is rate limited');

-- Blocks: the blocker sees a hidden placeholder; the blocked person sees nothing of the blocker.
select tests.login(1);
select tests.keep('crew2', tests.make_crew(1, array[2, 6]));
select tests.login(6);
select tests.keep('m6', (public.send_message(gen_random_uuid(), 'From six', tests.id('crew2'))).id);
select tests.login(2);
select tests.keep('m2', (public.send_message(gen_random_uuid(), 'From two', tests.id('crew2'))).id);
select tests.block(2, 6);
select tests.login(2);
select is((select count(*)::integer from public.messages where id = tests.id('m6')), 0,
  'RLS hides a blocked person''s message (and its realtime event)');
select is((select is_hidden from public.crew_messages(tests.id('crew2')) where id = tests.id('m6')), true,
  'the blocker gets a hidden placeholder');
select is((select body from public.crew_messages(tests.id('crew2')) where id = tests.id('m6')), null,
  'with no words');
select is((select sender_id from public.crew_messages(tests.id('crew2')) where id = tests.id('m6')), null,
  'and no sender');
select tests.login(6);
select is((select count(*)::integer from public.crew_messages(tests.id('crew2')) where id = tests.id('m2')), 0,
  'the blocked person sees no trace of the blocker''s messages');
select is((public.send_message(gen_random_uuid(), 'hey @nobody', tests.id('crew2'), null, null, array[tests.u(2)])).mention_ids,
  '{}'::uuid[], 'mentions never cross a block');

-- Report a message (members who can read it only).
select tests.login(1);
select ok(public.report('message', tests.id('m6'), 'harassment') is not null, 'a member reports a message');
select tests.login(9);
select throws_ok($$select public.report('message', tests.id('m6'), 'spam')$$, 'P0001', 'subject_not_found',
  'someone outside the chat cannot report it');

-- Delete: soft, words gone.
select tests.login(6);
select ok(public.delete_message(tests.id('m6')), 'the sender deletes');
select is((select body from public.messages where id = tests.id('m6')), null, 'the words are gone');
select is((select is_deleted from public.crew_messages(tests.id('crew2')) where id = tests.id('m6')), true, 'shown as deleted');

-- Edit.
select tests.login(1);
select tests.keep('m1b', (public.send_message(gen_random_uuid(), 'Typo', tests.id('crew2'))).id);
select is((public.edit_message(tests.id('m1b'), 'Fixed')).body, 'Fixed', 'the sender edits');
select tests.login(2);
select throws_ok($$select public.edit_message(tests.id('m1b'), 'Mine now')$$, 'P0001', 'not_author', 'others cannot edit');
select throws_ok($$select public.delete_message(tests.id('m1b'))$$, 'P0001', 'not_author',
  'members cannot delete others'' messages (owners and admins can)');

-- Pagination with a before cursor.
select tests.login(3);
select is((select count(*)::integer from public.crew_messages(tests.id('crew'), null, 5)), 5, 'a page has the limit');
select ok((select bool_and(m.created_at <= (select created_at from public.messages where id = (select id from public.crew_messages(tests.id('crew'), null, 5) order by created_at, id limit 1)))
           from public.crew_messages(tests.id('crew'),
                (select id from public.crew_messages(tests.id('crew'), null, 5) order by created_at, id limit 1), 5) m),
  'the next page is older');

-- Activity chat: people in the game only.
select tests.keep('live', tests.live_game(1, array[1, 2]));
select tests.login(2);
select ok((public.send_message(gen_random_uuid(), 'On my way', null, tests.id('live'))).id is not null,
  'a player writes in the activity chat');
select tests.login(4);
select throws_ok($$select public.send_message(gen_random_uuid(), 'hi', null, tests.id('live'))$$, 'P0001', 'not_attending',
  'someone not in the game cannot write');
select throws_ok($$select * from public.activity_messages(tests.id('live'))$$, 'P0001', 'not_attending',
  'or read');
select is((select count(*)::integer from public.messages where activity_id = tests.id('live')), 0, 'RLS agrees');

-- Crew plans: visible to that crew only.
select tests.logout();
insert into public.plans (sport_id, starts_at, duration_minutes, capacity, audience, crew_id, deadline_at, source,
                          created_by, host_id, member_count)
values ('football', now() + interval '1 day', 90, 8, 'crew', tests.id('crew2'), now() + interval '20 hours', 'chat',
        tests.u(1), tests.u(1), 1)
returning tests.keep('crew_plan', id);
insert into public.plan_members (plan_id, user_id, via) values (tests.id('crew_plan'), tests.u(1), 'host');
select tests.login(2);
select is((select crew_name from public.plan_cards where id = tests.id('crew_plan')), 'Test Crew',
  'a crew member sees the crew plan and its crew');
select tests.login(4);
select is((select count(*)::integer from public.plan_cards where id = tests.id('crew_plan')), 0,
  'someone outside the crew does not');
select throws_ok($$select public.im_down(tests.id('crew_plan'), gen_random_uuid())$$, 'P0001', 'plan_not_found',
  'and cannot join');
select throws_ok($$select public.create_plan(gen_random_uuid(), 'football', now() + interval '1 day', 8, null, 'crew')$$,
  'P0001', 'invalid_argument', 'create_plan cannot make a crew plan without a crew');

-- RLS everywhere.
select tests.logout();
select is((select count(*)::integer from pg_tables where schemaname = 'public' and not rowsecurity), 0,
  'RLS is enabled on every public table');

select * from finish();
rollback;
