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

-- Step 6 BE-HOST-OPS helpers. tests.u(p_host) runs a program with one series at Test Pitch
-- (p_price cents a drop-in, members free, every day at 19:00 for 90 minutes, capacity p_capacity).
create function tests.make_program(p_host integer, p_price integer default 800, p_capacity integer default 10)
returns uuid language plpgsql security definer as $$
declare
  v_p uuid;
  v_s uuid;
begin
  insert into public.host_programs (name, sport_id, area, created_by)
  values ('Test Pickup', 'football', 'Plateau', tests.u(p_host)) returning id into v_p;
  insert into public.host_program_hosts (program_id, user_id, role) values (v_p, tests.u(p_host), 'owner');
  insert into public.host_series (program_id, name, sport_id, place_id, start_time, duration_minutes, capacity,
                                  repeat_days, starts_on, price_cents, member_price_cents, created_by)
  values (v_p, 'Tuesday 7-a-side', 'football', '00000000-0000-4000-9100-000000000001', '19:00', 90, p_capacity,
          '{1,2,3,4,5,6,7}', current_date - 120, p_price, 0, tests.u(p_host))
  returning id into v_s;
  perform tests.keep('series', v_s);
  return v_p;
end;
$$;

-- A session of the 'series' on current_date + p_days (negative: in the past).
create function tests.session(p_days integer, p_series uuid default null) returns uuid
language plpgsql security definer as $$
begin
  return private.host_create_session(coalesce(p_series, tests.id('series')), current_date + p_days);
end;
$$;

-- Put tests.u(n) in a session with a status (confirmed, waitlisted, checked_in). Keeps the counts.
create function tests.attend(p_session uuid, n integer, p_status public.attendance_status default 'confirmed',
                             p_confirmed_at timestamptz default null)
returns void language plpgsql security definer as $$
declare
  v_a uuid := (select activity_id from public.host_sessions where id = p_session);
begin
  insert into public.attendance (activity_id, user_id, status, confirmed_at, waitlisted_at, checked_in_at, check_in_method)
  values (v_a, tests.u(n), p_status,
          case when p_status <> 'waitlisted' then coalesce(p_confirmed_at, now() - interval '1 day') end,
          case when p_status = 'waitlisted' then now() - interval '1 hour' end,
          case when p_status = 'checked_in' then now() - interval '1 minute' end,
          case when p_status = 'checked_in' then 'host'::public.check_in_method end);
  update public.activities
     set confirmed_count = confirmed_count + case when p_status in ('confirmed', 'checked_in') then 1 else 0 end,
         waitlist_count = waitlist_count + case when p_status = 'waitlisted' then 1 else 0 end,
         checked_in_count = checked_in_count + case when p_status = 'checked_in' then 1 else 0 end
   where id = v_a;
end;
$$;

-- Step 6 BE-HOST-OPS: passes, memberships, the ledger (charges, refunds, payouts, provider 'none'), the
-- placeholder service fee, per-person payment status, refund decisions with their audit trail.
select no_plan();

select tests.keep('prog', tests.make_program(1));

-- The fee lives in one place and says it's a placeholder.
select is((public.host_service_fee_policy() ->> 'placeholder')::boolean, true, 'the fee policy is a placeholder');
select is(private.host_service_fee_cents(45600), 3600::bigint, '8% of $456, to the nearest dollar, is $36');
select is(private.host_service_fee_cents(0), 0::bigint, 'no gross, no fee');

-- Passes ---------------------------------------------------------------------------------------------------
select tests.login(1);
select tests.keep('k1', gen_random_uuid());
select tests.keep('drop', public.create_host_pass(tests.id('prog'), 'drop_in', 'Drop-in', 800, tests.id('k1'),
                                                  'One session, any Tuesday or Thursday'));
select is(public.create_host_pass(tests.id('prog'), 'drop_in', 'Drop-in', 800, tests.id('k1')), tests.id('drop'),
          'create_host_pass is idempotent with its key');
select tests.keep('pack', public.create_host_pass(tests.id('prog'), 'pack', '10-pack', 7000, gen_random_uuid(),
                                                  '10 sessions, use within 4 months', 10, 120));
select tests.keep('monthly', public.create_host_pass(tests.id('prog'), 'monthly', 'Monthly', 3500, gen_random_uuid()));
select throws_ok(format($$select public.create_host_pass(%L, 'free', 'Free', 500, gen_random_uuid())$$, tests.id('prog')),
                 'P0001', 'price_invalid', 'a free pass costs nothing');
select throws_ok(format($$select public.create_host_pass(%L, 'pack', 'Pack', 5000, gen_random_uuid())$$, tests.id('prog')),
                 'P0001', 'pass_invalid', 'a pack says how many sessions');
select is((public.update_host_pass(tests.id('drop'), 'Drop-in', 900)).price_cents, 900, 'a host edits a price');
select tests.login(2);
select throws_ok(format($$select public.create_host_pass(%L, 'drop_in', 'Drop-in', 800, gen_random_uuid())$$, tests.id('prog')),
                 'P0001', 'not_program_host', 'only hosts sell passes');
select throws_ok(format($$select public.archive_host_pass(%L)$$, tests.id('drop')), 'P0001', 'not_program_host',
                 'only hosts archive passes');
select is((select count(*) from public.host_passes where program_id = tests.id('prog')), 3::bigint,
          'signed-in people can read what a program sells');

-- Memberships ----------------------------------------------------------------------------------------------
select tests.login(1);
select tests.keep('m3', public.grant_host_pass(tests.id('monthly'), tests.u(3), true, gen_random_uuid()));
select is((select status::text || ' ' || renews from public.host_memberships where id = tests.id('m3')), 'active true',
          'a monthly membership is active and renews');
select is((select source from public.host_program_members where program_id = tests.id('prog') and user_id = tests.u(3)),
          'pass', 'it makes them a program member (host_program_members, source pass)');
select is((select status::text || ' ' || method || ' ' || provider || ' ' || amount_cents from public.host_charges
           where membership_id = tests.id('m3')), 'paid host_recorded none 3500', 'the charge is recorded with provider none');
select throws_ok(format($$select public.grant_host_pass(%L, %L, true, gen_random_uuid())$$, tests.id('monthly'), tests.u(3)),
                 'P0001', 'already_member', 'one monthly membership at a time');
select throws_ok(format($$select public.grant_host_pass(%L, %L, true, gen_random_uuid())$$, tests.id('drop'), tests.u(3)),
                 'P0001', 'pass_invalid', 'drop-ins are paid per session');
select tests.logout();
-- Bought ten days ago.
update public.host_memberships set started_at = now() - interval '10 days' where id = tests.id('m3');
update public.host_program_members set started_at = now() - interval '10 days' where user_id = tests.u(3);
update public.host_charges set paid_at = now() - interval '10 days' where membership_id = tests.id('m3');
select tests.login(1);
select tests.keep('m5', public.grant_host_pass(tests.id('pack'), tests.u(5), true, gen_random_uuid()));

-- Per-person payment status (HostRoster) -------------------------------------------------------------------
select tests.logout();
select tests.keep('s1', tests.session(1));
select tests.attend(tests.id('s1'), 3);
select tests.attend(tests.id('s1'), 4);
select tests.attend(tests.id('s1'), 5);
select is((private.host_payment_for(tests.id('s1'), tests.u(3))).label, 'MEMBER', 'a member: MEMBER');
select is((private.host_payment_for(tests.id('s1'), tests.u(4))).label, '$8 AT FIELD', 'nothing paid: $8 AT FIELD');
select is((private.host_payment_for(tests.id('s1'), tests.u(4))).status, 'due_at_field', 'status due_at_field');
select is((private.host_payment_for(tests.id('s1'), tests.u(5))).label || ' · ' || (private.host_payment_for(tests.id('s1'), tests.u(5))).detail,
          '10-PACK · 10 sessions left', 'a pack holder: the pack and what is left');
select is((private.host_payment_for(tests.id('s1'), tests.u(1))).label, 'HOST', 'the host');
select is((private.host_session_settlement(tests.id('s1'))).settled || ' of ' || (private.host_session_settlement(tests.id('s1'))).total,
          '2 of 3', 'two of three settled');
select is((private.host_session_settlement(tests.id('s1'))).note, 'Tester is new and pays $8 at the field.',
          'the settlement names who still pays');
select tests.login(1);
select is((select count(*) from public.host_session_payments(tests.id('s1'))), 3::bigint, 'host_session_payments: everyone in');
select tests.keep('k2', gen_random_uuid());
select is(public.mark_paid_at_field(tests.id('s1'), tests.u(4), tests.id('k2')) ->> 'state', 'paid', 'mark paid at the field');
select is(public.mark_paid_at_field(tests.id('s1'), tests.u(4), gen_random_uuid()) ->> 'state', 'paid', 'again: still paid');
select is((select count(*) from public.host_charges where session_id = tests.id('s1') and user_id = tests.u(4)), 1::bigint,
          'one drop-in charge, however often it is marked');
select tests.logout();
select is((private.host_payment_for(tests.id('s1'), tests.u(4))).label, 'PAID $8', 'PAID $8');
select tests.login(1);
select throws_ok(format($$select public.mark_paid_at_field(%L, %L, gen_random_uuid())$$, tests.id('s1'), tests.u(9)),
                 'P0001', 'not_attending', 'only people in the session');
select tests.login(4);
select throws_ok(format($$select public.mark_paid_at_field(%L, %L, gen_random_uuid())$$, tests.id('s1'), tests.u(4)),
                 'P0001', 'not_program_host', 'people cannot mark themselves paid');
select throws_ok(format($$select * from public.host_session_payments(%L)$$, tests.id('s1')), 'P0001', 'not_program_host',
                 'only hosts read payment status');
select is((select count(*) from public.host_charges), 1::bigint, 'people see their own charges only');
select tests.login(9);
select is((select count(*) from public.host_charges), 0::bigint, 'others see no charges');
select is((select count(*) from public.host_ops_audit), 0::bigint, 'or the audit trail');

-- A pack is used at check-in.
select tests.logout();
update public.attendance set status = 'checked_in', checked_in_at = now(), check_in_method = 'host'
 where activity_id = (select activity_id from public.host_sessions where id = tests.id('s1')) and user_id = tests.u(5);
select is((private.host_payment_for(tests.id('s1'), tests.u(5))).detail, '9 sessions left', 'checking in uses one pack session');
update public.attendance set status = 'confirmed', checked_in_at = null, check_in_method = null
 where activity_id = (select activity_id from public.host_sessions where id = tests.id('s1')) and user_id = tests.u(5);
update public.attendance set status = 'checked_in', checked_in_at = now(), check_in_method = 'host'
 where activity_id = (select activity_id from public.host_sessions where id = tests.id('s1')) and user_id = tests.u(5);
select is((select count(*) from public.host_pass_uses where membership_id = tests.id('m5')), 1::bigint,
          'once per session');

-- A dropped spot filled from the waitlist refunds automatically ------------------------------------------
select tests.keep('s2', tests.session(2));
select tests.attend(tests.id('s2'), 6);
select tests.attend(tests.id('s2'), 7);
select tests.attend(tests.id('s2'), 8, 'waitlisted');
update public.activities set capacity = 2 where id = (select activity_id from public.host_sessions where id = tests.id('s2'));
select tests.login(1);
select public.mark_paid_at_field(tests.id('s2'), tests.u(6), gen_random_uuid());
select tests.login(6);
select public.cancel_attendance((select activity_id from public.host_sessions where id = tests.id('s2')), gen_random_uuid());
select is((select status::text || ' ' || reason || ' ' || amount_cents || ' ' || provider from public.host_refunds
           where user_id = tests.u(6)), 'pending spot_filled 800 none', 'the dropper is refunded automatically');
select is((select related_user_id from public.host_refunds where user_id = tests.u(6)), tests.u(8),
          'naming who took the spot');
select tests.login(1);
select is((select state::text || ' ' || refund_cents from public.host_session_payments(tests.id('s2')) where user_id = tests.u(6)),
          'refunded 800', 'the roster shows the dropped person as refunded');
select is((select count(*) from public.host_ops_audit where action = 'refund_auto'), 1::bigint, 'audited');

-- A called-off session refunds its drop-ins.
select tests.keep('s3', tests.session(3));
select tests.attend(tests.id('s3'), 9);
select public.mark_paid_at_field(tests.id('s3'), tests.u(9), gen_random_uuid());
select tests.logout();
update public.host_sessions set status = 'skipped', skipped_at = now() where id = tests.id('s3');
select is((select reason::text from public.host_refunds where user_id = tests.u(9)), 'session_cancelled',
          'a skipped session refunds');

-- Refund requests and decisions --------------------------------------------------------------------------
select tests.login(3);
select tests.keep('cancel', (public.cancel_host_membership(tests.id('m3'), gen_random_uuid(),
  'New job with late shifts. Could I get some of October back?') ->> 'refund_request_id')::uuid);
select is((select status::text || ' ' || renews from public.host_memberships where id = tests.id('m3')), 'cancelled false',
          'cancelling stops the renewal');
select isnt(tests.id('cancel'), null, 'and asks for a refund');
select tests.login(1);
select is(jsonb_array_length(public.host_money_view(tests.id('prog')) -> 'decisions'), 1, 'NEEDS A DECISION');
select is(public.host_money_view(tests.id('prog')) -> 'decisions' -> 0 ->> 'note',
          'New job with late shifts. Could I get some of October back?', 'with their words');
select tests.logout();
select is((select count(*) from private.host_needs_you_ops(tests.id('prog')) where kind = 'refund_request')::int, 1,
          'and on Host home');
select tests.login(1);
select throws_ok(format($$select public.decide_host_refund(%L, 'partial', gen_random_uuid(), 3500)$$, tests.id('cancel')),
                 'P0001', 'refund_amount_invalid', 'a partial refund is less than the whole');
select tests.login(3);
select throws_ok(format($$select public.decide_host_refund(%L, 'full', gen_random_uuid())$$, tests.id('cancel')),
                 'P0001', 'not_program_host', 'people cannot decide their own refund');
select tests.login(1);
select tests.keep('k3', gen_random_uuid());
select is(public.decide_host_refund(tests.id('cancel'), 'partial', tests.id('k3'), 2500) ->> 'refund_cents', '2500',
          'REFUND $25');
select is(public.decide_host_refund(tests.id('cancel'), 'partial', tests.id('k3'), 2500) ->> 'status', 'refunded_partial',
          'retrying the same key returns the same decision');
select is((select count(*) from public.host_refunds where request_id = tests.id('cancel')), 1::bigint, 'one refund');
select is((select status::text || ' ' || provider from public.host_refunds where request_id = tests.id('cancel')), 'pending none',
          'pending: no provider is connected');
select is((select status::text from public.host_memberships where id = tests.id('m3')), 'ended', 'the membership ends today');
select ok(not authz.is_program_member(tests.id('prog'), tests.u(3)), 'and they are no longer a member');
select is((select amount_cents from public.host_ops_audit where action = 'refund_decided'), 2500, 'the decision is audited');
select throws_ok(format($$select public.decide_host_refund(%L, 'keep', gen_random_uuid())$$, tests.id('cancel')),
                 'P0001', 'refund_already_decided', 'a decided request is not decided again another way');
select is(public.undo_host_refund_decision(tests.id('cancel')) ->> 'status', 'open', 'UNDO reopens it');
select is((select status::text from public.host_refunds where request_id = tests.id('cancel')), 'cancelled',
          'the pending refund is cancelled');
select is((select status::text from public.host_memberships where id = tests.id('m3')), 'cancelled',
          'the membership is back as it was');
select is(public.decide_host_refund(tests.id('cancel'), 'keep', gen_random_uuid()) ->> 'status', 'kept', 'KEEP IT');
select is((select count(*) from public.host_refunds where request_id = tests.id('cancel') and status <> 'cancelled'),
          0::bigint, 'keeping refunds nothing');
select ok(authz.is_program_member(tests.id('prog'), tests.u(3)), 'they stay a member to the end of the period');
select is((select ends_at from public.host_program_members where program_id = tests.id('prog') and user_id = tests.u(3)),
          (select period_ends_at from public.host_memberships where id = tests.id('m3')), 'and no longer');
select is((select count(*) from public.host_ops_audit where subject_id = tests.id('cancel')), 4::bigint,
          'requested, decided, undone, decided: all in the trail');
select tests.logout();
select throws_ok($$update public.host_ops_audit set action = 'x'$$, 'P0001', 'audit_immutable', 'the audit trail is insert-only');
select throws_ok($$delete from public.host_ops_audit$$, 'P0001', 'audit_immutable', 'and cannot be deleted');
select throws_ok(format($$insert into public.host_charges (program_id, user_id, kind, pass_id, amount_cents, currency, method, provider)
                          values (%L, %L, 'pack', %L, 100, 'CAD', 'app', 'paypal')$$, tests.id('prog'), tests.u(2), tests.id('pack')),
                 '23514', null, 'no provider but none or Stripe (Step 8)');

-- Payouts ---------------------------------------------------------------------------------------------------
select tests.login(1);
select ok((public.host_money_view(tests.id('prog')) -> 'next_payout' ->> 'net_cents')::bigint
          = (public.host_money_view(tests.id('prog')) -> 'next_payout' ->> 'gross_cents')::bigint
            - (public.host_money_view(tests.id('prog')) -> 'next_payout' ->> 'refunds_cents')::bigint
            - (public.host_money_view(tests.id('prog')) -> 'next_payout' ->> 'fee_cents')::bigint,
          'You get = charges − refunds − the fee');
select is(public.host_money_view(tests.id('prog')) ->> 'provider', 'none', 'not connected to a provider');
select is((public.host_money_view(tests.id('prog')) -> 'members' ->> 'count')::int, 1, 'members');
select tests.logout();
insert into public.host_charges (program_id, user_id, kind, pass_id, amount_cents, currency, status, method, paid_at)
values (tests.id('prog'), tests.u(10), 'pack', tests.id('pack'), 7000, 'CAD', 'paid', 'app', now() - interval '15 days');
select ok(private.host_close_payouts(tests.id('prog')) >= 1, 'finished weeks close into payouts');
select is(private.host_close_payouts(tests.id('prog')), 0, 'once');
select is((select gross_cents::text || ' ' || fee_cents || ' ' || net_cents || ' ' || status from public.host_payouts
           where program_id = tests.id('prog') and gross_cents = 7000), '7000 600 6400 scheduled',
          'a closed payout is frozen and waits for a provider');
select tests.login(1);
select is(jsonb_array_length(public.host_money_view(tests.id('prog')) -> 'past_payouts') >= 1, true, 'PAST PAYOUTS');
select tests.login(2);
select throws_ok(format($$select public.host_money_view(%L)$$, tests.id('prog')), 'P0001', 'not_program_host',
                 'only hosts see the money');
select is((select count(*) from public.host_payouts), 0::bigint, 'or the payouts');

select * from finish();
rollback;
