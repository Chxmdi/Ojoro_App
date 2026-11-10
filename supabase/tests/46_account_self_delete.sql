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

-- Polish ACCOUNT: deleting your own account (docs/TRUST_CONTRACT.md, "Deleting your own account").
grant usage on schema tests to service_role;
grant select on tests.ids to service_role;

create function tests.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end;
$$;

create function tests.err(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end;
$$;

-- A program owned by tests.u(n), optionally on Stripe.
create function tests.program(n integer, p_name text, p_stripe boolean default true) returns uuid
language plpgsql security definer as $$
declare
  v uuid;
begin
  insert into public.host_programs (name, sport_id, area, created_by)
  values (p_name, 'football', 'Plateau', tests.u(n)) returning id into v;
  insert into public.host_program_hosts (program_id, user_id, role) values (v, tests.u(n), 'owner');
  if p_stripe then
    insert into public.host_payment_accounts (program_id, account_id, charges_enabled, payouts_enabled, details_submitted, ready_at)
    values (v, 'acct_' || replace(v::text, '-', ''), true, true, true, now());
  end if;
  return v;
end;
$$;

create function tests.kinds(n integer) returns text[] language sql security definer as $$
  select coalesce(array_agg(b ->> 'kind' order by ord), '{}')
  from jsonb_array_elements(private.account_deletion_blockers(tests.u(n))) with ordinality as x(b, ord);
$$;

select no_plan();

-- Who can call what -------------------------------------------------------------------------------------------
select tests.login(1);
select is(public.account_deletion_check(), '{"can_delete": true, "blockers": []}'::jsonb, 'nothing stops a plain account');
select throws_ok($$select public.account_delete(tests.u(1), 'app')$$, '42501', null, 'a person cannot call the delete directly');
select throws_ok($$select public.account_deletion_preflight(tests.u(2))$$, '42501', null, 'or read someone else''s preflight');
select tests.logout();
set local role anon;
select throws_ok($$select public.account_deletion_check()$$, '42501', null, 'signed out: no check');
reset role;

-- Paused people can still check (and delete).
insert into private.account_pauses (user_id, reason, staff_note, starts_at) values (tests.u(2), 'spam', 'test', now() - interval '1 minute');
select tests.login(2);
select is((public.account_deletion_check() ->> 'can_delete')::boolean, true, 'a paused account can check');
select tests.logout();

-- Blockers ----------------------------------------------------------------------------------------------------------
insert into private.staff_members (user_id, role, note) values (tests.u(3), 'moderator', 'test');
select is(tests.kinds(3), '{staff}', 'staff accounts are refused');

-- u4 owns a Stripe program with a dispute, a refund on its way and money not yet paid out.
select tests.keep('p4', tests.program(4, 'Alpha Pickup'));
insert into public.host_charges (id, program_id, user_id, kind, amount_cents, currency, status, method, provider, paid_at)
values ('46000000-0000-4000-8000-000000000001', tests.id('p4'), tests.u(5), 'pack', 7000, 'CAD', 'paid', 'app', 'stripe', now() - interval '1 hour');
select is(tests.kinds(4), '{payout_pending}', 'a Stripe charge this week is money still on its way');
insert into public.host_refunds (program_id, charge_id, user_id, amount_cents, currency, reason, status, provider)
values (tests.id('p4'), '46000000-0000-4000-8000-000000000001', tests.u(5), 1000, 'CAD', 'host_decision', 'pending', 'stripe');
insert into public.host_disputes (program_id, charge_id, user_id, provider_ref, amount_cents, currency, status)
values (tests.id('p4'), '46000000-0000-4000-8000-000000000001', tests.u(5), 'dp_test46', 7000, 'CAD', 'open');
select is(tests.kinds(4), '{dispute_open,refund_pending,payout_pending}', 'disputes first, then refunds, then payouts');
select is(private.account_deletion_blockers(tests.u(4)) -> 0 ->> 'program_name', 'Alpha Pickup', 'naming the program');
select tests.as_service();
select is(public.account_deletion_preflight(tests.u(4)) ->> 'status', 'blocked', 'preflight: blocked');
select throws_ok($$select public.account_delete(tests.u(4), 'app')$$, 'P0001', 'account_delete_blocked', 'the delete refuses too');
select tests.logout();
select is((select count(*)::integer from public.profiles where id = tests.u(4)), 1, 'and nothing was deleted');

-- Settled: the dispute closes, the refund goes through, the week closes and Stripe pays it.
update public.host_disputes set status = 'won', closed_at = now() where provider_ref = 'dp_test46';
update public.host_refunds set status = 'succeeded' where program_id = tests.id('p4');
update public.host_charges set paid_at = now() - interval '20 days' where program_id = tests.id('p4');
insert into public.host_payouts (program_id, period_start, period_end, pays_on, currency, gross_cents, refunds_cents,
                                 fee_cents, net_cents, status, paid_at)
values (tests.id('p4'), now() - interval '21 days', now() - interval '14 days', current_date - 14, 'CAD', 7000, 1000, 560, 5440,
        'scheduled', null);
select is(tests.kinds(4), '{payout_pending}', 'a closed week still scheduled is money on its way');
update public.host_payouts set status = 'paid', paid_at = now() where program_id = tests.id('p4');
insert into public.host_provider_payouts (program_id, provider_ref, amount_cents, currency, status)
values (tests.id('p4'), 'po_test46', 5440, 'CAD', 'in_transit');
select is(tests.kinds(4), '{payout_pending}', 'a Stripe payout in transit too');
update public.host_provider_payouts set status = 'paid' where provider_ref = 'po_test46';
select is(tests.kinds(4), '{}', 'all paid out: nothing stops it');

-- A program without Stripe holds no money in Ojoro: its scheduled weeks are records only.
select tests.keep('p6', tests.program(6, 'Field Cash', false));
insert into public.host_payouts (program_id, period_start, period_end, pays_on, currency, gross_cents, refunds_cents,
                                 fee_cents, net_cents, status, paid_at)
values (tests.id('p6'), now() - interval '14 days', now() - interval '7 days', current_date - 7, 'CAD', 800, 0, 64, 736,
        'scheduled', null);
select is(tests.kinds(6), '{}', 'a cash-only program does not block');

-- Deleting -------------------------------------------------------------------------------------------------------------
select tests.keep('game', tests.connect(7, 8));
-- u7's analytics: their own rows, and their id inside other people's payloads (top level, arrays, nested).
insert into private.analytics_events (name, user_id, payload) values
  ('test_mine', tests.u(7), '{"kind": "x"}'),
  ('test_theirs', tests.u(8), jsonb_build_object('opponent', tests.u(7), 'kind', 'y',
     'people', jsonb_build_array(tests.u(7), tests.u(9)), 'nested', jsonb_build_object('by', tests.u(7), 'n', 2)));
-- Only rows this file writes count (the local database keeps rows from real deletions).
create temp table before_run as
  select (select coalesce(max(id), 0) from private.trust_audit) as audit_id,
         (select coalesce(max(id), 0) from private.analytics_events) as event_id;
grant select on before_run to service_role;
select tests.as_service();
select throws_ok($$select public.account_delete(tests.u(3), 'app')$$, 'P0001', 'account_delete_staff', 'staff: refused at the delete as well');
select throws_ok($$select public.account_delete('f0000000-0000-4000-8000-000000000000', 'app')$$, 'P0001', 'invalid_argument',
                 'the placeholder cannot be deleted');
select is(public.account_deletion_preflight(tests.u(7)) ->> 'status', 'ready', 'u7 is ready');
select is(public.account_delete(tests.u(7), 'web'), '{"status": "deleted", "blockers": []}'::jsonb, 'deleted');
select is(public.account_delete(tests.u(7), 'web') ->> 'status', 'already_deleted', 'again: already deleted (idempotent)');
select is(public.account_deletion_preflight(tests.u(7)) ->> 'status', 'already_deleted', 'preflight agrees');
select tests.logout();
select is((select count(*)::integer from auth.users where id = tests.u(7)), 0, 'the Auth user is gone');
select is((select count(*)::integer from private.analytics_events where user_id = tests.u(7)), 0, 'no analytics row is theirs any more');
select is((select count(*)::integer from private.analytics_events where payload::text like '%' || tests.u(7)::text || '%'), 0,
          'and their id is in no payload');
select is((select user_id from private.analytics_events where name = 'test_mine'), null, 'their events stay, unlinked');
select is((select payload from private.analytics_events where name = 'test_theirs'),
          jsonb_build_object('kind', 'y', 'people', jsonb_build_array(tests.u(9)), 'nested', jsonb_build_object('n', 2)),
          'other people''s events keep everything but their id');
select is((select user_id from private.analytics_events where name = 'test_theirs'), tests.u(8), 'and stay linked to their own person');
select is((select host_id from public.activities where id = tests.id('game')), private.former_member(),
          'the game they hosted stays, by Former member');
select is((select count(*)::integer from public.attendance where activity_id = tests.id('game') and user_id = tests.u(8)), 1,
          'the other player keeps it');
select is((select count(*)::integer from private.trust_audit where action = 'account_self_deleted'
            and id > (select audit_id from before_run) and detail = '{"source": "web", "owned_programs": 0}'::jsonb and actor_id is null and target_user_id is null
            and subject_id is null), 1, 'one audit row, with no one''s id in it');
select is((select count(*)::integer from private.trust_audit where action = 'account_self_deleted'
            and detail::text like '%' || tests.u(7)::text || '%'), 0, 'not even in the detail');
select is((select count(*)::integer from private.analytics_events where name = 'account_deleted' and user_id is null
            and id > (select event_id from before_run)
            and payload = '{"source": "web"}'::jsonb), 1, 'an analytics event without the person');

-- u4, now settled, can delete too; the program is archived and kept.
select tests.as_service();
select is(public.account_delete(tests.u(4), 'app') ->> 'status', 'deleted', 'a settled host can delete');
select tests.logout();
select isnt((select archived_at from public.host_programs where id = tests.id('p4')), null, 'their program is archived');
select is((select user_id from public.host_charges where id = '46000000-0000-4000-8000-000000000001'), tests.u(5),
          'the buyer''s charge is untouched');

select * from finish();
rollback;
