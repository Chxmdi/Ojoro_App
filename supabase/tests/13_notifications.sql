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

-- Notifications: generated server-side, bundled, never across blocks, never for hidden objects,
-- and the would-send decision (settings, quiet hours, locked-screen privacy, throttle).
select no_plan();

create function tests.notes(n integer, p_type text default null) returns integer language sql security definer as $$
  select count(*)::integer from public.notifications
  where recipient_id = tests.u(n) and (p_type is null or type::text = p_type)
$$;

-- Threshold updates to the host, bundled into one row that counts.
select tests.keep('plan', tests.make_plan(1, 5));
select tests.join(2, tests.id('plan'));
select is(tests.notes(1, 'participant_update'), 1, 'the host hears that someone joined');
select tests.join(3, tests.id('plan'));
select is(tests.notes(1, 'participant_update'), 1, 'a second join is bundled into the same row');
select is((select count from public.notifications where recipient_id = tests.u(1) and type = 'participant_update'), 2,
  'and the row counts both');
select is((select actor_ids from public.notifications where recipient_id = tests.u(1) and type = 'participant_update'),
  array[tests.u(3), tests.u(2)], 'latest actor first');
select is(tests.notes(2, 'participant_update'), 0, 'members are not told about every join');

-- NEED ONE MORE at capacity - 1: members, and Pull Me In people who may be asked (never across a block).
select tests.connect(1, 5);
select tests.connect(1, 6);
insert into public.pull_me_in (user_id, sport_id, scope) values
  (tests.u(5), 'football', 'connections'), (tests.u(6), 'football', 'connections');
select tests.block(2, 6);
select tests.join(4, tests.id('plan'));
select is(tests.notes(2, 'need_one_more'), 1, 'members hear NEED ONE MORE');
select is(tests.notes(5, 'need_one_more'), 1, 'so does someone with Pull Me In who played with the host');
select is((select data ->> 'pull_me_in' from public.notifications where recipient_id = tests.u(5) and type = 'need_one_more'),
  'true', 'marked as a Pull Me In ask');
select is(tests.notes(6, 'need_one_more'), 0, 'not someone with a block with a member');
select is(tests.notes(7, 'need_one_more'), 0, 'not someone without Pull Me In');
select tests.login(5);
select is((select action from public.my_notifications() where type = 'need_one_more'), 'im_down',
  'the inline action for an outsider is I''M DOWN');
select is((select section from public.my_notifications() where type = 'need_one_more'), 'needs_you', 'and it needs you');
select public.mark_notifications_read(p_before => now() + interval '1 minute');
select is((select section from public.my_notifications() where type = 'need_one_more'), 'needs_you',
  'reading it does not take it out of needs you; acting on it does');
select tests.login(2);
select is((select action from public.my_notifications() where type = 'need_one_more'), 'pull_in',
  'for a member it is PULL SOMEONE IN');

-- GAME ON reaches every member; the NEED ONE MORE stops needing anyone.
select tests.join(5, tests.id('plan'));
select is(tests.notes(3, 'game_on'), 1, 'members hear GAME ON');
select tests.login(2);
select is((select section from public.my_notifications() where type = 'need_one_more'), 'today',
  'a filled plan no longer needs you');
select is((select href from public.my_notifications() where type = 'game_on'), '/plan/' || tests.id('plan') || '/game-on',
  'GAME ON links to the canonical plan');

-- Never across a block: a blocked actor's rows disappear, and nothing new is created.
select tests.login(1);
select is((select count(*)::integer from public.my_notifications() where type = 'participant_update'), 1, 'visible before');
select tests.block(1, 3);
select tests.login(1);
select is((select actor_names from public.my_notifications() where type = 'participant_update'), array['Tester 5', 'Tester 4', 'Tester 2'],
  'a blocked actor is dropped from the names');
select tests.logout();
select is(private.notify(array[tests.u(1)], 'participant_update', 'plan', tests.id('plan'), tests.u(3), 'x:1'), 0,
  'notify skips a recipient with a block with the actor');

-- Never for an object the recipient can't see: an invite to an invite-only plan disappears with it.
select tests.connect(8, 9);
select tests.keep('secret', tests.make_plan(8, 6, '5 hours', 'invite_only'));
select tests.login(8);
select public.pull_in(tests.id('secret'), array[tests.u(9)], gen_random_uuid());
select tests.login(9);
select is((select type::text from public.my_notifications() where plan_id = tests.id('secret')), 'pull_in_invite',
  'the invitee is told');
select is((select section from public.my_notifications() where plan_id = tests.id('secret')), 'needs_you', 'it needs them');
select is(public.unread_count(), 1, 'the bell counts it');
select public.decline_invite((select id from public.plan_invites where plan_id = tests.id('secret') and invitee_id = tests.u(9)));
select is((select count(*)::integer from public.my_notifications() where plan_id = tests.id('secret')), 0,
  'once the plan is hidden again, so is the notification');
select is((select count(*)::integer from public.notifications where plan_id = tests.id('secret')), 0, 'RLS agrees');
select is(public.unread_count(), 0, 'and the bell');
select tests.logout();
select is(private.notify(array[tests.u(10)], 'pull_in_invite', 'plan', tests.id('secret'), tests.u(8), 'x:2'), 0,
  'notify skips someone who cannot see the object');

-- Read, act.
select tests.login(2);
select ok(public.unread_count() >= 2, 'unread before');
select is(public.mark_notifications_read(array[(select id from public.my_notifications() where type = 'game_on')]), 1,
  'mark one read');
select throws_ok($$select public.mark_notifications_read()$$, 'P0001', 'invalid_argument', 'ids or a time');
select ok(public.mark_notifications_read(null, now()) >= 1, 'mark everything up to now read');
select is(public.unread_count(), 0, 'nothing unread');
select tests.login(5);
select is((public.act_on_notification((select id from public.notifications where recipient_id = tests.u(5) limit 1))).acted_at is not null,
  true, 'act_on_notification marks it acted');
select throws_ok($$select public.act_on_notification((select id from public.notifications where recipient_id = tests.u(1) limit 1))$$,
  'P0001', 'notification_not_found', 'not someone else''s');
select tests.login(2);
select is((select count(*)::integer from public.notifications where recipient_id <> tests.u(2)), 0, 'RLS: own rows only');

-- Would-send: nothing is sent; this decides.
select tests.logout();
select tests.keep('n', (select id from public.notifications where recipient_id = tests.u(1) and type = 'participant_update'
                        and object_id = tests.id('plan')));
update public.notifications set read_at = null where id = tests.id('n');
select is((select reason from private.would_send(tests.id('n'), (current_date + time '12:00') at time zone 'America/Toronto')),
  'no_device', 'no device, nothing to send');
select tests.login(1);
select throws_ok($$select public.register_push_token('not-a-token', 'ios')$$, 'P0001', 'push_token_invalid', 'tokens are Expo tokens');
select ok(public.register_push_token('ExponentPushToken[abcdefghijkl]', 'ios') is not null, 'register a device');
select tests.logout();
select is((select reason from private.would_send(tests.id('n'), ((current_date + time '12:00') at time zone 'America/Toronto'))),
  'ok', 'midday: it would send');
select is((select tokens from private.would_send(tests.id('n'), ((current_date + time '12:00') at time zone 'America/Toronto'))),
  array['ExponentPushToken[abcdefghijkl]'], 'to the device');
select is((select title || ' / ' || body from private.would_send(tests.id('n'))), 'Ojoro / Your plan has an update.',
  'lock-screen privacy by default: no who, what or where');
select is((select reason from private.would_send(tests.id('n'), ((current_date + time '23:30') at time zone 'America/Toronto'))),
  'quiet_hours', 'quiet hours (11 PM to 7 AM by default)');
select is((select deliver_after from private.would_send(tests.id('n'), ((current_date + time '23:30') at time zone 'America/Toronto'))),
  ((current_date + 1 + time '07:00') at time zone 'America/Toronto'), 'held until 7 AM');
select is((select reason from private.would_send(tests.id('n'), ((current_date + time '06:00') at time zone 'America/Toronto'))),
  'quiet_hours', 'still quiet at 6 AM');
select tests.login(1);
select is((public.set_notification_preferences(p_show_details => true)).show_details, true, 'details on');
select tests.logout();
select ok((select body from private.would_send(tests.id('n'))) like '% / 5 in.', 'with details on, the push says what happened');
select tests.login(1);
select is((public.set_notification_preferences(p_quiet_hours_enabled => false)).quiet_hours_enabled, false, 'quiet hours off');
select tests.logout();
select is((select reason from private.would_send(tests.id('n'), ((current_date + time '23:30') at time zone 'America/Toronto'))),
  'ok', 'then night pushes go');
select tests.login(1);
select is((public.set_notification_type('participant_update', false)).push_off, array['participant_update']::public.notification_type[],
  'turn one type off');
select tests.logout();
select is((select reason from private.would_send(tests.id('n'))), 'type_off', 'settings are respected');
select tests.login(1);
select public.set_notification_type('participant_update', true);
select ok(public.mute_object('plan', tests.id('plan')), 'mute this plan');
select tests.logout();
select is((select reason from private.would_send(tests.id('n'))), 'object_muted', 'muted objects are respected');
select tests.login(1);
select public.unmute_object('plan', tests.id('plan'));
select tests.logout();
select is(private.mark_pushed(array[tests.id('n')]), 1, 'the delivery layer marks it pushed');
update public.notifications set updated_at = now() + interval '1 minute' where id = tests.id('n');
select is((select reason from private.would_send(tests.id('n'))), 'rate_limited',
  'a repeated threshold update within 30 minutes is throttled');
select is((select reason from private.would_send(tests.id('n'), now() + interval '31 minutes')), 'ok', 'after 30 minutes it goes');
-- A large page: the queue is oldest-first and a busy local database can hold 100+ undrained rows.
select ok(exists (select 1 from private.delivery_queue(1000) q where q.notification_id = tests.id('n')),
  'the queue holds rows changed since the last push');
select tests.login(1);
select ok(public.unregister_push_token('ExponentPushToken[abcdefghijkl]'), 'unregister');
select tests.logout();
select is((select reason from private.would_send(tests.id('n'), now() + interval '31 minutes')), 'no_device', 'and nothing would go');

-- Waitlist promotion (to the person) and a cancellation (to the host).
select tests.keep('act', (select id from public.activities where plan_id = tests.id('plan')));
select tests.login(7);
select is((public.join_waitlist(tests.id('act'), gen_random_uuid())).status::text, 'waitlisted', 'seven waits');
select tests.login(2);
select public.cancel_attendance(tests.id('act'), gen_random_uuid());
select tests.logout();
select is(tests.notes(7, 'waitlist_promoted'), 1, 'the promoted person is told');
select is((select activity_id from public.notifications where recipient_id = tests.u(7) and type = 'waitlist_promoted'),
  tests.id('act'), 'about the activity');
select ok(exists (select 1 from public.notifications where recipient_id = tests.u(1) and type = 'participant_update'
                  and object_id = tests.id('act')), 'the host hears about the cancellation');

-- A new crew member: the others are told, bundled per crew.
select tests.keep('crew', tests.make_crew(1, array[2]));
select tests.login(1);
select public.crew_invite_code(tests.id('crew'));
select tests.login(4);
select public.join_crew(tests.crew_code(tests.id('crew')));
select tests.logout();
select is((select count from public.notifications where recipient_id = tests.u(1) and type = 'crew_member_joined'), 2,
  'joins are bundled per crew');
select is(tests.notes(2, 'crew_member_joined'), 1, 'other members hear it too');
select is(tests.notes(4, 'crew_member_joined'), 0, 'not the person who joined');
select * from finish();
rollback;
