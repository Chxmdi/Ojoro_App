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

-- Step 8 BE-PAYMENTS helpers ---------------------------------------------------------------------------
grant usage on schema tests to service_role;
grant select on tests.ids to service_role;

-- Act as the service role (what the payments edge functions use).
create function tests.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end;
$$;

-- A pass for a program (packs: 10 sessions in 120 days).
create function tests.pass(p_program uuid, p_kind public.host_pass_kind, p_price integer, p_name text default null)
returns uuid language sql security definer as $$
  insert into public.host_passes (program_id, kind, name, price_cents, sessions_included, valid_days, created_by)
  values (p_program, p_kind, coalesce(p_name, initcap(replace(p_kind::text, '_', '-'))), p_price,
          case when p_kind = 'pack' then 10 end, case when p_kind = 'pack' then 120 end,
          (select created_by from public.host_programs where id = p_program))
  returning id;
$$;

-- The program's Stripe account can take payments and pay out.
create function tests.connect_program(p_program uuid, p_account text default 'acct_test1') returns void
language sql security definer as $$
  insert into public.host_payment_accounts (program_id, account_id, charges_enabled, payouts_enabled, details_submitted, ready_at)
  values (p_program, p_account, true, true, true, now())
  on conflict (program_id) do update set charges_enabled = true, payouts_enabled = true, details_submitted = true;
$$;

-- A test-mode Stripe event around p_obj (Connect events carry p_account).
create function tests.evt(p_type text, p_obj jsonb, p_account text default null) returns jsonb language sql volatile as $$
  select jsonb_build_object('id', 'evt_' || replace(gen_random_uuid()::text, '-', ''), 'object', 'event', 'type', p_type,
                            'livemode', false, 'created', extract(epoch from now())::bigint,
                            'data', jsonb_build_object('object', p_obj))
         || case when p_account is null then '{}'::jsonb else jsonb_build_object('account', p_account) end;
$$;

-- Deliver an event the way stripe-webhook does (service role). Returns the result.
create function tests.deliver(p_event jsonb) returns jsonb language plpgsql as $$
declare
  v jsonb;
begin
  perform tests.as_service();
  v := public.payments_record_stripe_event(p_event);
  perform tests.logout();
  return v;
end;
$$;

-- tests.u(n) starts a checkout as themselves, and Stripe makes its session. Returns the checkout id.
create function tests.checkout(n integer, p_pass uuid, p_session uuid default null) returns uuid language plpgsql as $$
declare
  v uuid;
begin
  perform tests.login(n);
  v := (public.begin_host_checkout(gen_random_uuid(), p_pass, p_session) ->> 'checkout_id')::uuid;
  perform tests.as_service();
  perform public.payments_attach_checkout(v, 'cs_test_' || replace(v::text, '-', ''), 'https://checkout.stripe.com/c/pay/' || v);
  perform tests.logout();
  return v;
end;
$$;

-- The checkout.session.completed object Stripe sends for a paid checkout.
create function tests.completed(p_checkout uuid) returns jsonb language sql security definer as $$
  select jsonb_build_object(
    'id', c.provider_session_id, 'object', 'checkout.session',
    'mode', case when c.kind = 'monthly' then 'subscription' else 'payment' end,
    'payment_status', 'paid', 'status', 'complete', 'amount_total', c.amount_cents, 'currency', lower(c.currency),
    'client_reference_id', c.id, 'metadata', jsonb_build_object('ojoro_checkout_id', c.id), 'livemode', false,
    'payment_intent', case when c.kind <> 'monthly' then 'pi_' || left(replace(c.id::text, '-', ''), 20) end,
    'subscription', case when c.kind = 'monthly' then 'sub_' || left(replace(c.id::text, '-', ''), 20) end,
    'invoice', case when c.kind = 'monthly' then 'in_' || left(replace(c.id::text, '-', ''), 20) end)
  from public.payment_checkouts c where c.id = p_checkout;
$$;

-- Pay for a checkout (Stripe's webhook says so). Returns the result.
create function tests.pay(p_checkout uuid) returns jsonb language plpgsql as $$
begin
  return tests.deliver(tests.evt('checkout.session.completed', tests.completed(p_checkout)));
end;
$$;

-- Polish GAPS-SMALL: once a spot is settled, the session read says what was paid and how.
select no_plan();

select tests.keep('prog', tests.make_program(1));
select tests.keep('pack', tests.pass(tests.id('prog'), 'pack', 7000, '10-pack'));
select tests.connect_program(tests.id('prog'));
select tests.keep('s1', tests.session(1));
select tests.keep('s2', tests.session(2));

-- Due: exactly as before (no new keys).
select tests.attend(tests.id('s1'), 9);
select tests.login(9);
select is((public.host_purchase_options(tests.id('prog'), tests.id('s1')) -> 'session') - 'session_id',
          '{"state":"due","amount_cents":800,"currency":"CAD","buyable":true,"reason":null}'::jsonb,
          'due reads as before');

-- Paid in the app: the amount stays, settled by the app.
select tests.keep('c1', (public.begin_host_checkout(gen_random_uuid(), null, tests.id('s1')) ->> 'checkout_id')::uuid);
select tests.as_service();
select public.payments_attach_checkout(tests.id('c1'), 'cs_test_' || replace(tests.id('c1')::text, '-', ''),
                                       'https://checkout.stripe.com/c/pay/x');
select tests.logout();
select tests.pay(tests.id('c1'));
select tests.login(9);
create temp table paid as select public.host_purchase_options(tests.id('prog'), tests.id('s1')) -> 'session' as s;
grant select on paid to authenticated;
select is((select s ->> 'state' from paid), 'paid', 'paid');
select is((select (s ->> 'amount_cents')::int from paid), 800, 'the amount is kept after payment');
select is((select s ->> 'currency' from paid), 'CAD', 'in its currency');
select is((select s ->> 'settled_by' from paid), 'app', 'paid in the app');
select ok((select (s ->> 'paid_at') is not null from paid), 'with when');
select is((select s ->> 'reason' from paid), 'nothing_to_pay', 'nothing left to pay');
select is((select (s ->> 'buyable')::boolean from paid), false, 'and nothing to buy');
select ok((select not (s ? 'pass_name') and not (s ? 'refund_cents') from paid), 'no pass or refund keys');

-- Paid at the field (the host marked it).
select tests.logout();
select tests.attend(tests.id('s1'), 8);
insert into public.host_charges (program_id, user_id, kind, session_id, amount_cents, currency, status, method, paid_at, recorded_by)
values (tests.id('prog'), tests.u(8), 'drop_in', tests.id('s1'), 800, 'CAD', 'paid', 'at_field', now(), tests.u(1))
returning tests.keep('field_charge', id);
select tests.login(8);
select is((public.host_purchase_options(tests.id('prog'), tests.id('s1')) -> 'session') - 'session_id' - 'paid_at',
          '{"state":"paid","amount_cents":800,"currency":"CAD","buyable":false,"reason":"nothing_to_pay","settled_by":"at_field"}'::jsonb,
          'paid at the field');

-- Refunded: what was paid and what went back.
select tests.logout();
insert into public.host_refunds (program_id, charge_id, user_id, amount_cents, currency, reason, decided_by)
values (tests.id('prog'), tests.id('field_charge'), tests.u(8), 500, 'CAD', 'host_decision', tests.u(1));
select tests.login(8);
select is((public.host_purchase_options(tests.id('prog'), tests.id('s1')) -> 'session') - 'session_id',
          '{"state":"refunded","amount_cents":800,"currency":"CAD","buyable":false,"reason":"nothing_to_pay","settled_by":"refund","refund_cents":500}'::jsonb,
          'refunded: paid $8, $5 went back');

-- Covered by a pack.
select tests.attend(tests.id('s2'), 7);
select tests.pay(tests.checkout(7, tests.id('pack')));
select tests.login(7);
select is((public.host_purchase_options(tests.id('prog'), tests.id('s2')) -> 'session') - 'session_id',
          '{"state":"pack","amount_cents":null,"currency":"CAD","buyable":false,"reason":"nothing_to_pay","settled_by":"pack","pass_name":"10-pack","sessions_left":10}'::jsonb,
          'covered by your 10-pack');

-- Members (free at the member price).
select tests.logout();
insert into public.host_program_members (program_id, user_id) values (tests.id('prog'), tests.u(10));
select tests.attend(tests.id('s2'), 10);
select tests.login(10);
select is((public.host_purchase_options(tests.id('prog'), tests.id('s2')) -> 'session') ->> 'settled_by', 'membership', 'member');
select ok(((public.host_purchase_options(tests.id('prog'), tests.id('s2')) -> 'session') -> 'amount_cents') = 'null'::jsonb,
          'no amount for members');

-- Free sessions.
select tests.logout();
update public.host_sessions set price_cents = 0 where id = tests.id('s2');
select tests.attend(tests.id('s2'), 11);
select tests.login(11);
select is((public.host_purchase_options(tests.id('prog'), tests.id('s2')) -> 'session') ->> 'settled_by', 'free', 'free for me');

-- The host is not a buyer.
select tests.login(1);
select ok(not ((public.host_purchase_options(tests.id('prog'), tests.id('s2')) -> 'session') ? 'settled_by'), 'hosts: no settled_by');

-- Still private.
select tests.logout();
select ok(not has_function_privilege('authenticated', 'private.payments_session_reason(uuid,uuid)', 'execute'),
          'the helper stays private');

select * from finish();
rollback;
