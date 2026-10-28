-- Slice 01: time rules, realtime and moment storage.
--
-- Time: reads never depend on the job below having run. plan_cards / activity_cards compute
-- effective_status from timestamps, location_shares RLS hides expired rows, and every mutation checks
-- the effective status. private.tick() moves the stored status forward once a minute so that realtime
-- subscribers get an UPDATE when a plan expires or an activity goes live, after or complete.

create or replace function private.tick()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired_plans integer;
  v_expired_signals integer;
  v_live integer;
  v_after integer;
  v_complete integer := 0;
  v_shares integer;
  v_a record;
begin
  update public.plans set status = 'expired', expired_at = now()
   where status = 'forming' and deadline_at <= now();
  get diagnostics v_expired_plans = row_count;

  update public.plan_invites i set status = 'expired', responded_at = now()
    from public.plans p
   where p.id = i.plan_id and i.status = 'pending' and p.status in ('expired', 'cancelled');

  update public.intent_signals set status = 'expired'
   where status = 'active' and expires_at <= now();
  get diagnostics v_expired_signals = row_count;

  update public.activities set status = 'live', live_at = coalesce(live_at, starts_at)
   where status = 'confirmed' and coalesce(live_at, starts_at) <= now()
     and coalesce(ended_at, ends_at) > now();
  get diagnostics v_live = row_count;

  update public.activities set status = 'after'
   where status in ('confirmed', 'live') and coalesce(ended_at, ends_at) <= now() and after_closes_at > now();
  get diagnostics v_after = row_count;

  -- After window closed: the Recap is created if needed, frozen, and the activity is complete.
  for v_a in
    select a.id, a.host_id from public.activities a
    where a.status in ('confirmed', 'live', 'after') and a.after_closes_at <= now()
    for update skip locked
  loop
    perform private.ensure_recap(v_a.id, true);
    update public.activities set status = 'complete', completed_at = now() where id = v_a.id;
    perform private.emit('activity_completed', v_a.host_id, jsonb_build_object('activity_id', v_a.id));
    v_complete := v_complete + 1;
  end loop;

  delete from public.location_shares where expires_at <= now();
  get diagnostics v_shares = row_count;

  delete from private.idempotency_keys where created_at < now() - interval '7 days';

  return jsonb_build_object(
    'expired_plans', v_expired_plans, 'expired_signals', v_expired_signals, 'live', v_live,
    'after', v_after, 'complete', v_complete, 'ended_shares', v_shares);
end;
$$;
revoke all on function private.tick() from public, anon, authenticated;
grant execute on function private.tick() to service_role;

-- Run it every minute with pg_cron where available (it is in the local stack and on hosted projects).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('ojoro_tick', '* * * * *', 'select private.tick()');
  else
    raise notice 'pg_cron not available: call private.tick() from a scheduler';
  end if;
end;
$$;

-- Realtime ------------------------------------------------------------------------------------------
-- postgres_changes respects RLS: a subscriber only receives rows it could select.
-- Channel and filters per screen: docs/SLICE01_CONTRACT.md §Realtime.

alter publication supabase_realtime add table
  public.plans,
  public.plan_members,
  public.plan_time_options,
  public.plan_invites,
  public.activities,
  public.attendance,
  public.location_shares,
  public.result_proposals,
  public.moments,
  public.recaps;

-- Moments storage ------------------------------------------------------------------------------------
-- Private bucket. Object names: <activity_id>/<uploader user id>/<file>. Players of that game upload
-- while it is Live or in After; participants read; uploaders delete their own.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('moments', 'moments', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function authz.can_upload_moment(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_activity uuid := authz.path_activity_id(p_name);
  v_a public.activities%rowtype;
begin
  if v_activity is null or auth.uid() is null
     or split_part(p_name, '/', 2) <> auth.uid()::text or split_part(p_name, '/', 3) = '' then
    return false;
  end if;
  select * into v_a from public.activities where id = v_activity;
  if not found or not authz.is_player(v_activity, auth.uid()) then
    return false;
  end if;
  return v_a.status <> 'cancelled'
     and coalesce(v_a.live_at, v_a.starts_at) <= now()
     and v_a.after_closes_at > now();
end;
$$;
revoke all on function authz.can_upload_moment(text) from public, anon;
grant execute on function authz.can_upload_moment(text) to authenticated, service_role;

create policy "moments bucket: players upload during live and after" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'moments' and authz.can_upload_moment(name));

create policy "moments bucket: participants read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'moments'
    and authz.path_activity_id(name) is not null
    and authz.is_participant(authz.path_activity_id(name), (select auth.uid()))
  );

create policy "moments bucket: uploader deletes own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'moments' and owner_id = (select auth.uid())::text);
