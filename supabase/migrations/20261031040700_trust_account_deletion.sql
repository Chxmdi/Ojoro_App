-- Step 8 (Trust): deleting an account always works, and history stays. Contract: docs/TRUST_CONTRACT.md
-- ("Account deletion").
--
-- The only deletion path is the Auth user going away (dashboard, Admin API, or `delete from auth.users`),
-- which cascades to public.profiles. Many history tables point at profiles with NO ACTION (plans, games,
-- Challenges, crews, clans, programs, ledgers…), so the cascade used to fail. Now, before the profile row
-- goes:
--   * what hasn't happened yet is called off: their forming plans, their games still to start, their
--     clan runs still to start; their host programs are archived;
--   * every NO ACTION reference to them is moved to one placeholder, "Former member" (NOT NULL columns),
--     or set to null (nullable ones). The list is read from the catalog, so later tables are covered;
--   * insert-only tables (results, ledger audit) accept those person-column changes and cascaded deletes
--     during this one deletion only (transaction-local `ojoro.account_deletion`), and never otherwise.
-- Rows that are only theirs (memberships, signals, Passport entries, messages, reports…) cascade as before.
-- Also: a paused account may unregister its push token (signing out works while paused).

-- The placeholder ---------------------------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, raw_user_meta_data, raw_app_meta_data, banned_until,
                        created_at, updated_at)
values ('f0000000-0000-4000-8000-000000000000', '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', '{"display_name": "Former member"}', '{"provider": "none", "placeholder": true}',
        'infinity', now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, display_name)
values ('f0000000-0000-4000-8000-000000000000', 'Former member')
on conflict (id) do update set display_name = 'Former member', handle = null, area = null, avatar_path = null;

create or replace function private.former_member()
returns uuid
language sql
immutable
set search_path = ''
as $$ select 'f0000000-0000-4000-8000-000000000000'::uuid $$;

-- Before a profile is deleted -------------------------------------------------------------------------------------

create or replace function private.prepare_account_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_former uuid := private.former_member();
  f record;
begin
  if old.id = v_former then
    raise exception using errcode = 'P0001', message = 'invalid_argument', detail = 'the placeholder stays';
  end if;
  perform set_config('ojoro.account_deletion', old.id::text, true);

  -- What hasn't happened yet is called off (the members are told, as for any cancellation).
  update public.plans set status = 'cancelled', cancelled_at = now()
   where host_id = old.id and status = 'forming';
  update public.activities set status = 'cancelled', cancelled_at = now()
   where host_id = old.id and status = 'confirmed' and starts_at > now();
  update public.clan_runs set status = 'cancelled', cancelled_at = now()
   where coalesce(host_id, created_by) = old.id and status <> 'cancelled' and starts_at > now();
  update public.host_programs set archived_at = now() where created_by = old.id and archived_at is null;

  -- History that would otherwise cascade away with them, and that other rows still point at, stays under
  -- the placeholder: Call-Outs that became Challenge Events, result submissions behind a result, and the
  -- hosts' ledger (charges, refund requests, refunds). A drop-in already held by the placeholder for the
  -- same session can't be moved twice (one per session); that rare row goes with the account.
  update public.call_outs o set challenger_id = v_former
   where o.challenger_id = old.id and exists (select 1 from public.challenge_events e where e.call_out_id = o.id);
  update public.call_outs o set opponent_id = v_former
   where o.opponent_id = old.id and exists (select 1 from public.challenge_events e where e.call_out_id = o.id);
  update public.challenge_result_submissions set submitted_by = v_former where submitted_by = old.id;
  update public.host_charges c set user_id = v_former
   where c.user_id = old.id
     and not (c.kind = 'drop_in' and c.status <> 'void' and exists (
       select 1 from public.host_charges x where x.session_id = c.session_id and x.user_id = v_former
         and x.kind = 'drop_in' and x.status <> 'void'));
  update public.host_refund_requests set user_id = v_former where user_id = old.id;
  update public.host_refunds set user_id = v_former where user_id = old.id;

  -- Every NO ACTION reference: the placeholder where a person is required, null where it is optional.
  for f in
    select c.conrelid::regclass as tbl, a.attname as col, a.attnotnull as required
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass and c.confdeltype = 'a'
      and cardinality(c.conkey) = 1
  loop
    execute format('update %s set %I = %L where %I = %L', f.tbl, f.col,
                   case when f.required then v_former end, f.col, old.id);
  end loop;
  return old;
end;
$$;

drop trigger if exists profiles_prepare_deletion on public.profiles;
create trigger profiles_prepare_deletion before delete on public.profiles
  for each row execute function private.prepare_account_deletion();

-- The allowance ends with the deletion: this AFTER trigger sorts after the RI cascade triggers
-- ("RI_ConstraintTrigger…"), so it runs once this profile's cascades are done.
create or replace function private.finish_account_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('ojoro.account_deletion', '', true);
  return null;
end;
$$;

drop trigger if exists zz_profiles_finish_deletion on public.profiles;
create trigger zz_profiles_finish_deletion after delete on public.profiles
  for each row execute function private.finish_account_deletion();

-- Insert-only tables allow the deletion's own changes (start from their latest definitions:
-- 20261029200100_competition_schema.sql, 20261030100100_communities_schema.sql,
-- 20261031020000_passport_schema.sql, 20261030210400_host_ops_cascade.sql). -------------------------------------

create or replace function private.deleting_account()
returns boolean
language sql
stable
set search_path = ''
as $$ select coalesce(current_setting('ojoro.account_deletion', true), '') <> '' $$;

create or replace function private.challenge_results_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Local seed files may clear their own sample rows; an account deletion may move its person columns.
  -- Nothing else may change or remove a result.
  if tg_op = 'DELETE' and current_setting('ojoro.seed_reset', true) = 'on' then
    return old;
  end if;
  if private.deleting_account() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception using errcode = 'P0001', message = 'result_already_verified',
    detail = 'challenge results are final';
end;
$$;

create or replace function private.refuse_result_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('ojoro.seed_reset', true) = 'on' or private.deleting_account() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception using errcode = 'P0001', message = 'result_already_verified', detail = '';
end;
$$;

create or replace function private.personal_bests_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Cascades (an account or a seed's sample event going away) may remove rows; nothing else may.
  if tg_op = 'DELETE' and (pg_trigger_depth() > 1 or current_setting('ojoro.seed_reset', true) = 'on'
                           or private.deleting_account()) then
    return old;
  end if;
  raise exception using errcode = 'P0001', message = 'result_already_verified',
    detail = 'personal bests are final';
end;
$$;

create or replace function private.host_ops_insert_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and (current_setting('ojoro.seed_reset', true) = 'on' or pg_trigger_depth() > 1) then
    return old;
  end if;
  -- An account deletion nulls or moves its person columns (confirmed_by, actor…); the rest stays.
  if private.deleting_account() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception using errcode = 'P0001', message = case tg_table_name
      when 'host_league_results' then 'result_already_verified' else 'audit_immutable' end,
    detail = tg_table_name || ' rows are final';
end;
$$;

-- Sign out while paused --------------------------------------------------------------------------------------------

create or replace function public.unregister_push_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Works while paused: signing out must always clean up this device.
  v_uid uuid := private.require_uid_any();
begin
  delete from public.push_tokens where token = p_token and user_id = v_uid;
  return true;
end;
$$;

revoke all on function private.former_member(), private.prepare_account_deletion(), private.finish_account_deletion(),
  private.deleting_account(),
  private.challenge_results_immutable(), private.refuse_result_change(), private.personal_bests_immutable(),
  private.host_ops_insert_only()
  from public, anon, authenticated;
