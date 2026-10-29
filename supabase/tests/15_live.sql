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

-- Live: who keeps score, updates, reactions, followers (never presence or location), freshness.
select no_plan();

select tests.keep('live', tests.live_game(1, array[1, 2, 3]));

-- Score: the host (Host confirms games).
select tests.login(2);
select throws_ok($$select public.log_score(tests.id('live'), 1, 0)$$, 'P0001', 'not_scorekeeper',
  'a player can''t keep score when the host confirms');
select tests.login(4);
select throws_ok($$select public.log_score(tests.id('live'), 1, 0)$$, 'P0001', 'not_scorekeeper', 'nor can a spectator');
select tests.login(1);
select is((select team_a_score || '-' || team_b_score from public.log_score(tests.id('live'), 1, 0)), '1-0', 'the host logs it');
select is((select count(*)::integer from public.activity_updates where activity_id = tests.id('live') and kind = 'score'), 1,
  'a score post');
select is((select score_updated_at from public.log_score(tests.id('live'), 1, 0)),
          (select score_updated_at from public.activity_live where activity_id = tests.id('live')), 'the same score again');
select is((select count(*)::integer from public.activity_updates where activity_id = tests.id('live') and kind = 'score'), 1,
  'is idempotent: no second post');
select is((select body from public.activity_updates where activity_id = tests.id('live') and kind = 'score'), 'LIGHTS LEAD 1–0.',
  'the post says who leads');
select throws_ok($$select public.log_score(tests.id('live'), -1, 0)$$, 'P0001', 'invalid_argument', 'scores are 0–99');

-- Self-run games: players keep score too.
select tests.keep('selfrun', tests.live_game(5, array[5, 6], 'check_in'));
select tests.login(6);
select is((select team_a_score from public.log_score(tests.id('selfrun'), 2, 1)), 2,
  'with check-in only, a player may log the score');

-- Not live: refused.
select tests.keep('soon', tests.make_plan(1, 2));
select tests.join(2, tests.id('soon'));
select tests.keep('soon_act', (select id from public.activities where plan_id = tests.id('soon')));
select tests.login(1);
select throws_ok($$select public.log_score(tests.id('soon_act'), 1, 0)$$, 'P0001', 'activity_not_live',
  'no score before the game is live');

-- Followers: anyone who can see the game. Never presence or location.
select tests.logout();
insert into public.location_shares (activity_id, user_id, lat, lng, expires_at)
values (tests.id('live'), tests.u(2), 45.519, -73.588, now() + interval '1 hour');
insert into public.activity_updates (activity_id, kind, audience, body)
values (tests.id('live'), 'check_in', 'participants', 'Tester 3 checked in.');
select tests.login(4);
select ok(public.follow_activity(tests.id('live')), 'follow');
select ok(public.follow_activity(tests.id('live')), 'follow twice is fine');
select is((select follower_count from public.activity_live(tests.id('live'))), 1, 'counted once');
select is((select i_follow from public.activity_live(tests.id('live'))), true, 'i_follow');
select is((select count(*)::integer from public.attendance where activity_id = tests.id('live')), 0,
  'a follower sees no attendance (presence)');
select is((select count(*)::integer from public.location_shares where activity_id = tests.id('live')), 0,
  'a follower sees no location');
select is((select count(*)::integer from public.activity_updates_feed(tests.id('live')) where kind = 'check_in'), 0,
  'a follower sees no check-in posts');
select is((select count(*)::integer from public.activity_updates where activity_id = tests.id('live') and kind = 'check_in'), 0,
  'RLS agrees');
select ok((select count(*)::integer from public.activity_updates_feed(tests.id('live')) where kind = 'score') = 1,
  'a follower sees the score feed');
select tests.login(2);
select is((select count(*)::integer from public.activity_updates_feed(tests.id('live')) where kind = 'check_in'), 1,
  'people in the game see check-ins');

-- Freshness fields for "Updated 20 s ago".
select tests.login(4);
select ok((select server_now is not null and live_at is not null and last_update_at is not null and score_updated_at is not null
           from public.activity_live(tests.id('live'))), 'server_now, live_at, last_update_at, score_updated_at');
select is((select score_logged_by_name from public.activity_live(tests.id('live'))), 'Tester 1', 'logged by the host');
select is((select score_logged_by_host from public.activity_live(tests.id('live'))), true, '(host)');
select is((select can_log_score from public.activity_live(tests.id('live'))), false, 'followers can''t log');
select ok(not public.unfollow_activity(tests.id('live')), 'unfollow');
select is((select follower_count from public.activity_live(tests.id('live'))), 0, 'count back to 0');

-- Updates: people in the game post, while live; rate limited.
select throws_ok($$select public.post_update(tests.id('live'), 'Go Lights', gen_random_uuid())$$, 'P0001', 'not_attending',
  'spectators don''t post updates');
select tests.login(2);
select tests.keep('post', (public.post_update(tests.id('live'), 'GOAL · TESTER 2.', gen_random_uuid())).id);
select lives_ok($$select public.post_update(tests.id('live'), 'Post ' || n, gen_random_uuid()) from generate_series(1, 5) n$$,
  'six in a minute is fine');
select throws_ok($$select public.post_update(tests.id('live'), 'Seventh', gen_random_uuid())$$, 'P0001', 'message_rate_limited',
  'the seventh is rate limited');
select throws_ok($$select public.post_update(tests.id('soon_act'), 'Early', gen_random_uuid())$$, 'P0001', 'activity_not_live',
  'only while live');

-- Reactions: words, one per person per post, togglable.
select tests.login(4);
select is((public.react(tests.id('live'), 'lets_go', tests.id('post'))).reaction_counts, '{"lets_go": 1}'::jsonb, 'LET''S GO');
select is((public.react(tests.id('live'), 'respect', tests.id('post'))).reaction_counts, '{"respect": 1}'::jsonb,
  'another word replaces it: still one per person');
select is((public.react(tests.id('live'), 'respect', tests.id('post'))).reaction_counts, '{}'::jsonb, 'the same word takes it back');
select is((public.react(tests.id('live'), 'respect', tests.id('post'))).my_reaction::text, 'respect', 'and again');
select tests.login(3);
select is((public.react(tests.id('live'), 'respect', tests.id('post'))).reaction_counts, '{"respect": 2}'::jsonb,
  'another person adds one');
select is((select reaction_counts from public.activity_updates where id = tests.id('post')), '{"respect": 2}'::jsonb,
  'the post carries the counts (realtime)');
select is((public.react(tests.id('live'), 'lets_go')).reaction_counts, '{"lets_go": 1}'::jsonb, 'reactions to the game itself');
select is((select reaction_counts from public.activity_live where activity_id = tests.id('live')), '{"lets_go": 1}'::jsonb,
  'carried on activity_live');
select is((select count(*)::integer from public.activity_reactions where activity_id = tests.id('live')), 2,
  'you see only your own reaction rows');

-- Blocks: a blocked author's posts are hidden.
select tests.block(4, 2);
select tests.login(4);
select is((select count(*)::integer from public.activity_updates_feed(tests.id('live')) where author_id = tests.u(2)), 0,
  'a blocked author''s posts are hidden');
select throws_ok($$select public.react(tests.id('live'), 'lets_go', tests.id('post'))$$, 'P0001', 'update_not_found',
  'and can''t be reacted to');

-- Kick-off: starting the game posts it and tells followers.
select tests.login(7);
select ok(public.follow_activity(tests.id('soon_act')), 'follow a game before it starts');
select tests.logout();
update public.activities set check_in_opens_at = now() - interval '1 minute' where id = tests.id('soon_act');
select tests.login(1);
select is(public.start_activity(tests.id('soon_act'))::text, 'live', 'the host starts it');
select is((select count(*)::integer from public.activity_updates_feed(tests.id('soon_act')) where kind = 'kick_off'), 1,
  'a kick-off post');
select tests.logout();
select is((select count(*)::integer from public.notifications where recipient_id = tests.u(7) and type = 'live'), 1,
  'followers hear it''s live');
select tests.login(1);
select ok(public.end_activity(tests.id('soon_act')) is not null, 'FULL TIME');
select is((select count(*)::integer from public.activity_updates_feed(tests.id('soon_act')) where kind = 'full_time'), 1,
  'a full-time post');

-- Report a live update.
select tests.login(3);
select ok(public.report('update', tests.id('post'), 'inappropriate') is not null, 'live updates can be reported');

select * from finish();
rollback;
