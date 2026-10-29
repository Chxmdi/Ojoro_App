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

-- The crowd: visibility by audience, follow, predictions (lock at LIVE), backing (separate), the
-- hype feed, comments, polls, cheers, organizers. Never money; never who.
select no_plan();

select tests.keep('ev', tests.event(1, 2));

-- Visibility by audience.
select tests.keep('friends_ev', tests.event(3, 4, '3 days', 'friends'));
select tests.keep('private_ev', tests.event(5, 6, '3 days', 'participants'));
select tests.connect(3, 7);
select tests.login(7);
select is((select count(*)::integer from public.challenge_event_view(tests.id('friends_ev'))), 1,
  'friends: someone who played with a competitor sees it');
select throws_ok(format($$select * from public.challenge_event_view(%L)$$, tests.id('private_ev')), 'P0001',
  'challenge_event_not_found', 'participants only: not visible to others');
select tests.login(8);
select throws_ok(format($$select * from public.challenge_event_view(%L)$$, tests.id('friends_ev')), 'P0001',
  'challenge_event_not_found', 'friends: a stranger doesn''t see it');
select is((select count(*)::integer from public.challenge_events where id = tests.id('friends_ev')), 0, 'RLS agrees');
select is((select count(*)::integer from public.challenge_event_view(tests.id('ev'))), 1, 'public: anyone signed in');

-- Follow.
select tests.login(8);
select is((public.follow_challenge_event(tests.id('ev'))).follower_count, 1, 'FOLLOW EVENT');
select is((public.follow_challenge_event(tests.id('ev'))).follower_count, 1, 'twice counts once');
select is((public.follow_challenge_event(tests.id('ev'), p_comments_muted => true)).comments_muted, true, 'MUTE COMMENTS');
select is((select i_follow and comments_muted from public.challenge_event_view(tests.id('ev'))), true, 'in the view');
select is((public.unfollow_challenge_event(tests.id('ev'))).follower_count, 0, 'unfollow');
select is((public.follow_challenge_event(tests.id('ev'))).following, true, 'follow again');

-- Predictions: one per person, changeable, percentages only from 5.
select tests.login(8);
select is((public.predict_challenge(tests.id('ev'), 'a')).my_prediction::text, 'a', 'WHO TAKES IT?');
select is((public.predict_challenge(tests.id('ev'), 'a')).changed, false, 'same pick again changes nothing');
select is((public.predict_challenge(tests.id('ev'), 'b')).my_prediction::text, 'b', 'changed before the start');
select is((select count(*)::integer from public.challenge_predictions where event_id = tests.id('ev')), 1,
  'still one prediction per person');
select is((select prediction_count from public.challenge_event_view(tests.id('ev'))), 1, 'count shown');
select is((select prediction_a_pct from public.challenge_event_view(tests.id('ev'))), null, 'no percentage under 5');
select tests.predict(9, tests.id('ev'), 'a');
select tests.predict(10, tests.id('ev'), 'a');
select tests.predict(11, tests.id('ev'), 'a');
select tests.predict(12, tests.id('ev'), 'b');
select tests.login(8);
select is((select prediction_a_pct || '/' || prediction_b_pct from public.challenge_event_view(tests.id('ev'))), '60/40',
  'percentages from 5 predictions');
select is((select count(*)::integer from public.challenge_predictions where event_id = tests.id('ev')), 1,
  'nobody can list who predicted what (own row only)');

-- Competitors pick only themselves.
select tests.login(1);
select throws_ok(format($$select public.predict_challenge(%L, 'b')$$, tests.id('ev')), 'P0001', 'prediction_not_allowed',
  'a competitor can''t predict the other side');
select is((public.predict_challenge(tests.id('ev'), 'a')).my_prediction::text, 'a', 'but can pick themselves');

-- Backing is separate from prediction.
select tests.login(8);
select is((public.back_challenge(tests.id('ev'), 'a')).my_backing::text, 'a', 'BACK side a');
select is((select my_prediction::text || '/' || my_backing::text from public.challenge_event_view(tests.id('ev'))), 'b/a',
  'predict one side, back the other');
select is((public.back_challenge(tests.id('ev'), null)).my_backing, null, 'stop backing');
select is((public.back_challenge(tests.id('ev'), 'a')).backing_a, 1, 'back again');

-- "6 of your Crew back Chimdi": people in your crews.
select tests.keep('crew', tests.make_crew(9, array[9, 10, 8]));
select tests.login(10);
select public.back_challenge(tests.id('ev'), 'a');
select tests.login(9);
select is((select crew_backing_a from public.challenge_event_view(tests.id('ev'))), 2, 'crew members backing a side');

-- No money anywhere: no stake, odds, payout or points column in the schema.
select is((select count(*)::integer from information_schema.columns
           where table_schema = 'public' and (table_name like 'challenge%' or table_name in ('call_outs', 'rivalries'))
             and (column_name ~ '(stake|odds|payout|wager|bet|points|price|amount|cents)')), 0,
  'no gambling columns');

-- Hype feed: competitors (and approved organizers) post; spectators don't.
select tests.login(8);
select throws_ok(format($$select public.post_challenge_update(%L, 'statement', 'Hi', gen_random_uuid())$$, tests.id('ev')),
  'P0001', 'not_competitor', 'spectators don''t post updates');
select tests.login(2);
select tests.keep('pkey', gen_random_uuid());
select tests.keep('post', (public.post_challenge_update(tests.id('ev'), 'training', 'Last tempo run before Saturday.',
  tests.id('pkey'), '{"distance_km": 5.2, "time_seconds": 1428}')).id);
select is((public.post_challenge_update(tests.id('ev'), 'training', 'Last tempo run before Saturday.',
  tests.id('pkey'), '{"distance_km": 5.2, "time_seconds": 1428}')).id, tests.id('post'), 'idempotent');
select throws_ok(format($$select public.post_challenge_update(%L, 'training', 'x', gen_random_uuid(), '{"weight_kg": 80}')$$,
  tests.id('ev')), 'P0001', 'invalid_argument', 'only distance and time can be shared');
select throws_ok(format($$select public.post_challenge_update(%L, 'system', 'x', gen_random_uuid())$$, tests.id('ev')),
  'P0001', 'invalid_argument', 'nobody posts as Ojoro');
select is((select author_role || '|' || kind || '|' || (stats ->> 'distance_km') from public.challenge_feed(tests.id('ev'))
            where id = tests.id('post')), 'competitor|training|5.2', 'the feed names the role');
select tests.login(8);
select is((select title from public.my_notifications() where type = 'challenge_posts'),
  'New post in Tester 1 vs Tester 2', 'followers hear about posts');

-- Organizers: proposed by one side, approved by the other.
select tests.login(1);
select is(public.propose_challenge_organizer(tests.id('ev'), tests.u(11)), false, 'proposed');
select tests.login(11);
select throws_ok(format($$select public.post_challenge_update(%L, 'logistics', 'Start moved to the gate.', gen_random_uuid())$$,
  tests.id('ev')), 'P0001', 'not_competitor', 'not yet approved');
select tests.login(2);
select is(public.propose_challenge_organizer(tests.id('ev'), tests.u(11)), true, 'the other side approves');
select tests.login(11);
select tests.keep('org_post', (public.post_challenge_update(tests.id('ev'), 'logistics', 'Start moved to the gate.', gen_random_uuid())).id);
select is((select author_role from public.challenge_feed(tests.id('ev')) where id = tests.id('org_post')),
  'organizer', 'an approved organizer posts');
select tests.login(1);
select throws_ok(format($$select public.propose_challenge_organizer(%L, %L)$$, tests.id('ev'), tests.u(2)), 'P0001',
  'organizer_not_allowed', 'a competitor can''t be an organizer');

-- The Crowd: comments, replies one level deep, RESPECT, blocks.
select tests.login(8);
select tests.keep('c1', (public.comment_on_challenge(tests.id('ev'), 'Tester 1 has been out every morning.', gen_random_uuid())).id);
select tests.login(1);
select tests.keep('r1', (public.comment_on_challenge(tests.id('ev'), 'Mornings don''t win races.', gen_random_uuid(),
  p_parent_id => tests.id('c1'))).id);
select throws_ok(format($$select public.comment_on_challenge(%L, 'deeper', gen_random_uuid(), p_parent_id => %L)$$,
  tests.id('ev'), tests.id('r1')), 'P0001', 'invalid_argument', 'replies are one level deep');
select throws_ok(format($$select public.comment_on_challenge(%L, '', gen_random_uuid())$$, tests.id('ev')), 'P0001',
  'message_invalid', 'not empty');
select tests.login(9);
select is((public.respect_challenge_comment(tests.id('c1'))).respect_count, 1, 'RESPECT');
select is((public.respect_challenge_comment(tests.id('c1'))).respected, false, 'tap again takes it back');
select public.respect_challenge_comment(tests.id('c1'));
select is((select string_agg(coalesce(author_badge, '-') || ':' || coalesce(parent_id::text, 'top'), ',')
           from public.challenge_comments(tests.id('ev'))),
  '-:top,competitor:' || tests.id('c1'), 'a thread: the comment then its reply, with the COMPETITOR badge');
select is((select reply_count from public.challenge_comments(tests.id('ev')) where id = tests.id('c1')), 1, '1 reply');
select is((select comment_count from public.challenge_event_view(tests.id('ev'))), 2, 'THE CROWD · 2');
select tests.block(9, 8);
select tests.login(9);
select is((select count(*)::integer from public.challenge_comments(tests.id('ev'))), 0,
  'a blocked author''s comment, and the replies under it, are left out');
select is((select count(*)::integer from public.challenge_comments where id = tests.id('c1')), 0, 'RLS agrees');
select tests.login(10);
select ok(public.report('challenge_comment', tests.id('c1'), 'harassment') is not null, 'comments can be reported');
select ok(public.report('challenge_post', tests.id('post'), 'spam') is not null, 'posts can be reported');
select ok(public.report('challenge_event', tests.id('ev'), 'unsafe') is not null, 'events can be reported');
select tests.login(8);
select ok(public.delete_challenge_comment(tests.id('c1')), 'the author deletes');
select is((select is_deleted from public.challenge_comments(tests.id('ev')) where id = tests.id('c1')), true, 'soft');

-- Polls from the allowlist only; the server writes the words.
select tests.login(8);
select throws_ok(format($$select public.create_challenge_poll(%L, 'winner')$$, tests.id('ev')), 'P0001', 'not_competitor',
  'spectators don''t make polls');
select tests.login(1);
select tests.keep('poll', (public.create_challenge_poll(tests.id('ev'), 'performance', 1380)).id);
select is((select question || ' | ' || array_to_string(options, ' / ') from public.challenge_polls where id = tests.id('poll')),
  'Anyone under 23 minutes? | Yes, at least one / Neither', 'the server writes the question');
select throws_ok(format($$select public.create_challenge_poll(%L, 'performance', 1300)$$, tests.id('ev')), 'P0001',
  'poll_exists', 'one per template');
select tests.login(8);
select is((public.vote_challenge_poll(tests.id('poll'), 0)).vote_counts, array[1, 0], 'vote');
select is((public.vote_challenge_poll(tests.id('poll'), 1)).vote_counts, array[0, 1], 'change the vote');
select throws_ok(format($$select public.vote_challenge_poll(%L, 5)$$, tests.id('poll')), 'P0001', 'option_not_found',
  'a real option');
select tests.logout();
update public.challenge_polls set closes_at = now() - interval '1 minute' where id = tests.id('poll');
select tests.login(8);
select throws_ok(format($$select public.vote_challenge_poll(%L, 0)$$, tests.id('poll')), 'P0001', 'poll_closed',
  'closed polls take no votes');

-- Cheers: one word per person; the same again takes it back.
select tests.login(8);
select is(((public.react_challenge(tests.id('ev'), 'lets_go')).reaction_counts ->> 'lets_go')::integer, 1, 'LET''S GO');
select is((public.react_challenge(tests.id('ev'), 'respect')).my_reaction::text, 'respect', 'another word replaces it');
select is((public.react_challenge(tests.id('ev'), 'respect')).my_reaction, null, 'the same word takes it back');

-- Predictions lock at LIVE and never touch the result.
select tests.go_live(tests.id('ev'), 1, 2);
select tests.login(8);
select is((select stage::text from public.challenge_event_view(tests.id('ev'))), 'live', 'live');
select throws_ok(format($$select public.predict_challenge(%L, 'a')$$, tests.id('ev')), 'P0001', 'predictions_locked',
  'predictions lock at LIVE');
select is((select predictions_locked from public.challenge_event_view(tests.id('ev'))), true, 'and say so');
select is((public.back_challenge(tests.id('ev'), 'b')).my_backing::text, 'b', 'backing can still change during LIVE');
select is((select body from public.challenge_feed(tests.id('ev')) where milestone = 'live'),
  'PREDICTIONS LOCKED. THE CHALLENGE IS LIVE.', 'the LIVE milestone');
select is((select count(*)::integer from public.my_notifications() where type = 'challenge_milestone'
            and data ->> 'milestone' = 'live'), 1, 'followers hear it went live');

-- Locked by the clock too, even before anyone presses ready.
select tests.keep('ev2', tests.event(3, 5));
select tests.logout();
update public.challenge_events set starts_at = now() - interval '1 minute' where id = tests.id('ev2');
select tests.login(8);
select throws_ok(format($$select public.predict_challenge(%L, 'a')$$, tests.id('ev2')), 'P0001', 'predictions_locked',
  'past the start, predictions are locked');

select * from finish();
rollback;
