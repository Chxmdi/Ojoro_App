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

-- Step 8 BE-PAYMENTS: the live-mode switch, Connect accounts, server-priced Checkout, purchase reads.
select no_plan();

select tests.keep('prog', tests.make_program(1));
insert into public.host_program_hosts (program_id, user_id, role) values (tests.id('prog'), tests.u(2), 'co_host');
select tests.keep('pack', tests.pass(tests.id('prog'), 'pack', 7000, '10-pack'));
select tests.keep('monthly', tests.pass(tests.id('prog'), 'monthly', 3500, 'Monthly'));
select tests.keep('free', tests.pass(tests.id('prog'), 'free', 0, 'Sunday beginners'));
select tests.keep('dropin', tests.pass(tests.id('prog'), 'drop_in', 800, 'Drop-in'));

-- The switch: test mode only -------------------------------------------------------------------------------
select is(public.payments_mode_policy() ->> 'live_enabled', 'false', 'live mode is off');
select is(private.payments_live_enabled(), false, 'and the server reads it as off');
select is(private.host_application_fee_cents(800), 64, 'the placeholder rate on one $8 charge: 64 cents');
select is(private.host_application_fee_cents(0), 0, 'no charge, no fee');
select is(private.host_application_fee_percent(), 8.00, 'and as a subscription percent');

-- Accounts --------------------------------------------------------------------------------------------------
select tests.login(1);
select is(public.host_payment_account(tests.id('prog')) ->> 'status', 'not_connected', 'not connected yet');
select is(public.host_payment_account(tests.id('prog')) ->> 'can_onboard', 'true', 'the owner can connect');
select is(public.host_money_view(tests.id('prog')) ->> 'payments_connected', 'false', 'HostMembership: not connected');
select is(public.host_money_view(tests.id('prog')) ->> 'provider', 'none', 'no provider yet');
select is(public.host_insights(tests.id('prog')) ->> 'provider', 'none', 'Insights: no provider yet');
select is(public.host_insights(tests.id('prog')) ->> 'payments_connected', 'false', 'Insights: not connected');
select is(public.payments_connect_context(tests.id('prog')) ->> 'program_name', 'Test Pickup', 'the owner gets the context');
select tests.login(2);
select is(public.host_payment_account(tests.id('prog')) ->> 'can_onboard', 'false', 'co-hosts see it but cannot connect');
select throws_ok(format('select public.payments_connect_context(%L)', tests.id('prog')), 'P0001', 'owner_required',
                 'co-hosts cannot onboard');
select tests.login(5);
select throws_ok(format('select public.host_payment_account(%L)', tests.id('prog')), 'P0001', 'not_program_host',
                 'people cannot read the account');
select throws_ok(format($$select public.payments_attach_account(%L, 'acct_x', %L)$$, tests.id('prog'), tests.u(5)),
                 '42501', null, 'only the service role stores accounts');

select tests.as_service();
select is(public.payments_attach_account(tests.id('prog'), 'acct_test1', tests.u(1)) ->> 'status', 'onboarding',
          'an account Stripe just made is onboarding');
select is(public.payments_attach_account(tests.id('prog'), 'acct_other', tests.u(1)) ->> 'account_id', 'acct_test1',
          'a program keeps its first account');
select throws_ok(format($$select public.payments_attach_account(%L, 'bad', null)$$, tests.id('prog')), 'P0001',
                 'invalid_argument', 'account ids look like Stripe''s');
select is(public.payments_update_account('{"id":"acct_test1","charges_enabled":false,"payouts_enabled":false,
  "details_submitted":true,"requirements":{"currently_due":["external_account"],"disabled_reason":"requirements.past_due"}}') ->> 'status',
  'restricted', 'details in, but Stripe needs more: restricted');
select is(public.payments_update_account('{"id":"acct_unknown"}'), null, 'unknown accounts are not ours');
select throws_ok($$select public.payments_update_account('{"id":"acct_test1","livemode":true,"charges_enabled":true}')$$,
                 'P0001', 'payments_unavailable', 'a live account is refused while the switch is off');
select tests.logout();
select is((select requirements_due from public.host_payment_accounts where program_id = tests.id('prog')),
          '{external_account}'::text[], 'requirements are kept by field name');

-- Not ready: nothing to buy in the app.
select tests.login(5);
select is(public.host_purchase_options(tests.id('prog')) ->> 'payments_connected', 'false', 'not connected for buyers');
select is((select p ->> 'reason' from jsonb_array_elements(public.host_purchase_options(tests.id('prog')) -> 'passes') p
           where p ->> 'id' = tests.id('pack')::text), 'not_connected', 'packs wait for the account');
select throws_ok(format('select public.begin_host_checkout(gen_random_uuid(), %L)', tests.id('pack')), 'P0001',
                 'payments_not_connected', 'no checkout before the account is ready');

select tests.as_service();
select is(public.payments_update_account('{"id":"acct_test1","charges_enabled":true,"payouts_enabled":true,
  "details_submitted":true,"requirements":{"currently_due":[]}}') ->> 'status', 'ready', 'ready');
select tests.logout();
select isnt((select ready_at from public.host_payment_accounts where program_id = tests.id('prog')), null, 'ready_at is set');
select is((select count(*) from public.host_ops_audit where program_id = tests.id('prog') and action = 'payments_connected'), 1::bigint, 'audited once');
select is((select count(*) from private.analytics_events where name = 'payments_account_ready' and payload ->> 'program_id' = tests.id('prog')::text), 1::bigint, 'and measured');
select tests.login(1);
select is(public.host_money_view(tests.id('prog')) ->> 'payments_connected', 'true', 'HostMembership: connected');
select is(public.host_money_view(tests.id('prog')) ->> 'provider', 'stripe', 'through Stripe');
select is(public.host_insights(tests.id('prog')) ->> 'provider', 'stripe', 'Insights report Stripe');
select is(public.host_insights(tests.id('prog')) ->> 'payments_connected', 'true', 'and connected');
select is(jsonb_typeof(public.host_insights(tests.id('prog')) -> 'weeks'), 'array', 'the Step 6 insights are all there');
select is(public.host_money_view(tests.id('prog')) #>> '{payment_account,status}', 'ready', 'with the account state');
select is(jsonb_typeof(public.host_money_view(tests.id('prog')) -> 'disputes'), 'array', 'and disputes');
select is(jsonb_typeof(public.host_money_view(tests.id('prog')) -> 'next_payout'), 'object', 'the Step 6 view is all there');

-- Checkout: passes --------------------------------------------------------------------------------------------
select tests.login(5);
select is((select jsonb_object_agg(p ->> 'name', coalesce(p ->> 'reason', 'buyable'))
           from jsonb_array_elements(public.host_purchase_options(tests.id('prog')) -> 'passes') p),
          '{"10-pack":"buyable","Monthly":"buyable","Sunday beginners":"free","Drop-in":"needs_session"}'::jsonb,
          'what I can buy, with reasons');
select tests.keep('k1', gen_random_uuid());
select tests.keep('c1', (public.begin_host_checkout(tests.id('k1'), tests.id('pack')) ->> 'checkout_id')::uuid);
select is((select amount_cents || ' ' || currency || ' ' || application_fee_cents || ' ' || status || ' ' || kind
           from public.payment_checkouts where id = tests.id('c1')), '7000 CAD 560 creating pack',
          'priced by the server from the pass, with the placeholder fee');
select is((public.begin_host_checkout(tests.id('k1'), tests.id('pack')) ->> 'checkout_id')::uuid, tests.id('c1'),
          'the same key returns the same checkout');
select is((public.begin_host_checkout(gen_random_uuid(), tests.id('pack')) ->> 'checkout_id')::uuid, tests.id('c1'),
          'a new key while one is open resumes it (no paying twice)');
select is((select count(*) from public.payment_checkouts where user_id = tests.u(5)), 1::bigint, 'one checkout');
select throws_ok(format('select public.begin_host_checkout(gen_random_uuid(), %L)', tests.id('free')), 'P0001',
                 'checkout_invalid', 'free passes are not sold');
select throws_ok(format('select public.begin_host_checkout(gen_random_uuid(), %L)', tests.id('dropin')), 'P0001',
                 'checkout_invalid', 'drop-ins are bought from a session');
select throws_ok('select public.begin_host_checkout(gen_random_uuid())', 'P0001', 'checkout_invalid', 'something to buy');
select throws_ok(format('select public.begin_host_checkout(gen_random_uuid(), %L, %L)', tests.id('pack'), tests.id('pack')),
                 'P0001', 'checkout_invalid', 'one thing at a time');
select throws_ok(format('select public.begin_host_checkout(gen_random_uuid(), %L)', gen_random_uuid()), 'P0001',
                 'pass_not_found', 'unknown pass');
select throws_ok(format('select public.begin_host_checkout(null, %L)', tests.id('pack')), 'P0001',
                 'idempotency_key_required', 'a key per intention');

-- The function's view (service role): Stripe parameters and metadata linking back to our rows.
select tests.as_service();
select is(public.payments_checkout_params_for(tests.id('c1')) ->> 'account_id', 'acct_test1', 'to the host''s account');
select is(public.payments_checkout_params_for(tests.id('c1')) ->> 'item_name', 'Test Pickup · 10-pack', 'named for Stripe''s page');
select is(public.payments_checkout_params_for(tests.id('c1')) #>> '{metadata,ojoro_checkout_id}', tests.id('c1')::text,
          'metadata links back to the checkout');
select is(public.payments_checkout_params_for(tests.id('c1')) #>> '{metadata,ojoro_user_id}', tests.u(5)::text, 'and the buyer');
select is(public.payments_attach_checkout(tests.id('c1'), 'cs_test_1', 'https://checkout.stripe.com/c/pay/cs_test_1') ->> 'status',
          'open', 'the hosted page is open');
select is(public.payments_attach_checkout(tests.id('c1'), 'cs_test_1', 'https://checkout.stripe.com/c/pay/cs_test_1') ->> 'status',
          'open', 'attaching again is a no-op');
select throws_ok(format($$select public.payments_attach_checkout(%L, 'nope', 'http://x')$$, tests.id('c1')), 'P0001',
                 'invalid_argument', 'only Stripe sessions and https pages');
select tests.login(5);
select throws_ok(format($$select public.payments_attach_checkout(%L, 'cs_1', 'https://x')$$, tests.id('c1')), '42501', null,
                 'buyers cannot attach sessions');
select is(public.payment_checkout(tests.id('c1')) ->> 'url', 'https://checkout.stripe.com/c/pay/cs_test_1', 'I can resume it');
select is(public.host_purchase_options(tests.id('prog')) #>> '{open_checkout,checkout_id}', tests.id('c1')::text,
          'my open checkout is offered back');
select tests.login(6);
select throws_ok(format('select public.payment_checkout(%L)', tests.id('c1')), 'P0001', 'checkout_not_found',
                 'nobody else reads my checkout');
select is((select count(*) from public.payment_checkouts where program_id = tests.id('prog')), 0::bigint, 'or sees its row');
select tests.login(1);
select is((select count(*) from public.payment_checkouts where program_id = tests.id('prog')), 1::bigint, 'hosts see their program''s checkouts');

-- An expired page is not offered back.
select tests.logout();
update public.payment_checkouts set expires_at = now() - interval '1 minute' where id = tests.id('c1');
select tests.login(5);
select is(public.payment_checkout(tests.id('c1')) ->> 'status', 'expired', 'past its time it reads expired');
select is(public.payment_checkout(tests.id('c1')) ->> 'url', null, 'with no page');
select isnt((public.begin_host_checkout(gen_random_uuid(), tests.id('pack')) ->> 'checkout_id')::uuid, tests.id('c1'),
            'a new key then starts a new checkout');

-- Monthly: not twice.
select tests.logout();
insert into public.host_memberships (program_id, pass_id, user_id, kind, period_ends_at, renews)
values (tests.id('prog'), tests.id('monthly'), tests.u(7), 'monthly', now() + interval '20 days', true);
select tests.login(7);
select is((select p ->> 'reason' from jsonb_array_elements(public.host_purchase_options(tests.id('prog')) -> 'passes') p
           where p ->> 'id' = tests.id('monthly')::text), 'already_member', 'members see they are members');
select is(public.host_purchase_options(tests.id('prog')) #>> '{holding,kind}', 'monthly', 'and what they hold');
select throws_ok(format('select public.begin_host_checkout(gen_random_uuid(), %L)', tests.id('monthly')), 'P0001',
                 'already_member', 'and cannot buy it twice');
select tests.login(8);
select tests.keep('c8', (public.begin_host_checkout(gen_random_uuid(), tests.id('monthly')) ->> 'checkout_id')::uuid);
select is((select kind::text || ' ' || amount_cents from public.payment_checkouts where id = tests.id('c8')),
          'monthly 3500', 'others can');

-- Checkout: drop-ins ------------------------------------------------------------------------------------------
select tests.keep('s1', tests.session(1));
select tests.login(9);
select is(public.host_purchase_options(tests.id('prog'), tests.id('s1')) #>> '{session,reason}', 'not_attending',
          'not in the session: nothing to pay for');
select throws_ok(format('select public.begin_host_checkout(gen_random_uuid(), null, %L)', tests.id('s1')), 'P0001',
                 'not_attending', 'I''M DOWN first');
select tests.attend(tests.id('s1'), 9);
select tests.login(9);
select is((public.host_purchase_options(tests.id('prog'), tests.id('s1')) -> 'session') - 'session_id',
          '{"state":"due","amount_cents":800,"currency":"CAD","buyable":true,"reason":null}'::jsonb, 'due: $8, buyable');
select tests.keep('c2', (public.begin_host_checkout(gen_random_uuid(), null, tests.id('s1')) ->> 'checkout_id')::uuid);
select is((select kind::text || ' ' || amount_cents || ' ' || application_fee_cents from public.payment_checkouts
           where id = tests.id('c2')), 'drop_in 800 64', 'the session''s price for me');
select tests.as_service();
select is(public.payments_checkout_params_for(tests.id('c2')) ->> 'item_name', 'Test Pickup drop-in', 'a drop-in for Stripe''s page');
select ok((public.payments_checkout_params_for(tests.id('c2')) ->> 'item_description') like 'Tuesday 7-a-side · %',
          'with the series and time');
-- Members pay the member price (0 here): nothing to pay.
select tests.logout();
insert into public.host_program_members (program_id, user_id) values (tests.id('prog'), tests.u(10));
select tests.attend(tests.id('s1'), 10);
select tests.login(10);
select throws_ok(format('select public.begin_host_checkout(gen_random_uuid(), null, %L)', tests.id('s1')), 'P0001',
                 'nothing_to_pay', 'members are covered');
select tests.login(1);
select throws_ok(format('select public.begin_host_checkout(gen_random_uuid(), null, %L)', tests.id('s1')), 'P0001',
                 'not_attending', 'hosts are not buyers here');
select tests.logout();
update public.host_sessions set status = 'skipped', skipped_at = now() where id = tests.id('s1');
select tests.login(9);
select throws_ok(format('select public.begin_host_checkout(gen_random_uuid(), null, %L)', tests.id('s1')), 'P0001',
                 'session_skipped', 'a called-off session takes no payments');
select throws_ok(format('select public.host_purchase_options(%L, %L)', tests.id('prog'), gen_random_uuid()), 'P0001',
                 'session_not_found', 'unknown session');

-- Blocked by the owner: the program isn't there.
select tests.block(1, 11);
select tests.login(11);
select throws_ok(format('select public.host_purchase_options(%L)', tests.id('prog')), 'P0001', 'program_not_found',
                 'blocked people do not see the program');
select throws_ok(format('select public.begin_host_checkout(gen_random_uuid(), %L)', tests.id('pack')), 'P0001',
                 'pass_not_found', 'or its passes');
select tests.logout();
select throws_ok('select public.host_purchase_options(gen_random_uuid())', 'P0001', 'not_authenticated', 'signed in only');

select is((select count(*) from private.analytics_events where name = 'payments_checkout_started' and payload ->> 'program_id' = tests.id('prog')::text), 4::bigint,
          'checkouts started are measured');

select * from finish();
rollback;
