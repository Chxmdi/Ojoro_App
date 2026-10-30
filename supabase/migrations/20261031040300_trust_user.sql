-- Step 8 (Trust): the person's side. Account status (works while paused), appeals, missed games, and the
-- reputation reads applying staff corrections without changing attendance or signals.
-- Contract: docs/TRUST_CONTRACT.md. passport_reputation, profile_reputation, private.show_up_record and
-- private.trusted_host start from their latest definitions (20261031020100_passport_reads.sql,
-- 20261028191743_slice01_reads.sql, 20261031010200_places_reads.sql).

-- Reputation reads with corrections ----------------------------------------------------------------------------

-- The latest show-up correction for one game ('show_up_attended' | 'show_up_excused'), or null.
create or replace function private.show_up_correction(p_user uuid, p_activity uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select x.kind from private.reputation_corrections x
  where x.user_id = p_user and x.activity_id = p_activity and x.kind in ('show_up_attended', 'show_up_excused')
  order by x.created_at desc, x.id limit 1;
$$;

-- Games checked in to / games confirmed for that have ended (not cancelled). Staff corrections apply: an
-- 'attended' game counts as showed up, an 'excused' one counts for neither number.
create or replace function private.show_up_record(p_user uuid)
returns table (showed_up integer, committed integer)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) filter (where (t.status = 'checked_in' and c.k is distinct from 'show_up_excused')
                                or c.k = 'show_up_attended')::integer,
         count(*) filter (where c.k is distinct from 'show_up_excused')::integer
  from public.attendance t
  join public.activities x on x.id = t.activity_id
  left join lateral (select private.show_up_correction(p_user, t.activity_id) as k) c on true
  where t.user_id = p_user and t.status in ('checked_in', 'confirmed') and x.status <> 'cancelled'
    and coalesce(x.ended_at, x.ends_at) <= now();
$$;

create or replace function public.passport_reputation(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_me boolean := p_user_id = v_uid;
  v_history boolean;
  v_show record;
begin
  if not exists (select 1 from public.profiles p where p.id = p_user_id) or authz.is_blocked(p_user_id, v_uid) then
    return null;
  end if;
  v_history := authz.can_see_part(p_user_id, 'history', v_uid);
  select * into v_show from private.show_up_record(p_user_id);
  return jsonb_build_object(
    'threshold', 5,
    'signals', coalesce((
      select jsonb_agg(jsonb_build_object('kind', x.kind, 'confirmations', x.n) order by x.n desc, x.kind)
      from (select r.kind, count(*)::integer as n from public.reputation_signals r
            where r.subject_id = p_user_id and not private.signal_voided(r.giver_id, r.subject_id, r.activity_id)
            group by r.kind having count(*) >= 5) x), '[]'::jsonb),
    -- Yours only: kinds people have started to confirm (1 to 4), without the count.
    'building', case when v_me then coalesce((
      select jsonb_agg(x.kind order by x.kind)
      from (select r.kind from public.reputation_signals r
            where r.subject_id = p_user_id and not private.signal_voided(r.giver_id, r.subject_id, r.activity_id)
            group by r.kind having count(*) < 5) x), '[]'::jsonb)
      else '[]'::jsonb end,
    'show_up', case when v_me or (v_history and v_show.committed >= 5)
                    then jsonb_build_object('showed_up', v_show.showed_up, 'committed', v_show.committed) end,
    'hosted', private.hosted_count(p_user_id),
    'history_visible', v_history
  );
end;
$$;

create or replace function public.profile_reputation(p_user_id uuid)
returns table (kind public.reputation_kind, confirmations integer)
language sql
stable
security definer
set search_path = ''
as $$
  select r.kind, count(*)::integer
  from public.reputation_signals r
  where r.subject_id = p_user_id
    and auth.uid() is not null
    and not authz.is_blocked(p_user_id, auth.uid())
    and not private.signal_voided(r.giver_id, r.subject_id, r.activity_id)
  group by r.kind
  having count(*) >= 5
  order by count(*) desc, r.kind;
$$;

create or replace function private.trusted_host(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.hosted_count(p_user) >= 20
     and (select count(distinct r.giver_id) from public.reputation_signals r
          where r.subject_id = p_user and r.kind = 'great_host'
            and not private.signal_voided(r.giver_id, r.subject_id, r.activity_id)) >= 5
     and not exists (select 1 from public.reports rp
                     where rp.subject_kind = 'profile' and rp.subject_id = p_user and rp.status = 'actioned'
                       and rp.created_at > now() - interval '180 days')
     and not authz.is_paused(p_user);
$$;

-- Account status (works while paused) -----------------------------------------------------------------------------

create or replace function private.my_appeal_json(a private.appeals)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when a.id is null then null else jsonb_build_object(
    'id', a.id, 'kind', a.kind, 'status', a.status, 'subject_id', a.subject_id, 'message', a.message,
    'created_at', a.created_at, 'decided_at', a.decided_at, 'decision_note', a.decision_note,
    'correction_effect', a.correction_effect) end;
$$;

create or replace function public.my_account_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid_any();
  v_pause private.account_pauses%rowtype := private.active_pause(v_uid);
  v_appeal private.appeals%rowtype;
begin
  if v_pause.id is not null then
    select * into v_appeal from private.appeals a
    where a.user_id = v_uid and a.kind = 'account_pause' and a.subject_id = v_pause.id
    order by a.created_at desc limit 1;
  end if;
  return jsonb_build_object(
    'paused', v_pause.id is not null,
    'pause', case when v_pause.id is null then null else jsonb_build_object(
               'id', v_pause.id, 'reason', v_pause.reason, 'note_to_user', v_pause.note_to_user,
               'starts_at', v_pause.starts_at, 'ends_at', v_pause.ends_at) end,
    'appeal', private.my_appeal_json(v_appeal),
    'can_appeal', v_pause.id is not null and (v_appeal.id is null or v_appeal.status <> 'open')
                  and not exists (select 1 from private.appeals a where a.user_id = v_uid and a.kind = 'account_pause'
                                    and a.subject_id = v_pause.id and a.status = 'open'),
    'hidden_content', coalesce((
      select jsonb_agg(jsonb_build_object(
               'hide_id', h.id, 'subject_kind', h.subject_kind, 'hidden_at', h.hidden_at, 'reason', h.reason,
               'restored_at', h.restored_at,
               'appeal_status', (select a.status from private.appeals a where a.user_id = v_uid and a.kind = 'content_hidden'
                                   and a.subject_id = h.id order by a.created_at desc limit 1))
             order by h.hidden_at desc)
      from private.content_hides h
      where h.owner_id = v_uid and h.hidden_at > now() - interval '90 days'), '[]'::jsonb)
  );
end;
$$;

-- Games counted as missed in your show-up record (what a show-up appeal can be about).
create or replace function public.my_missed_games(p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object(
             'activity_id', x.id, 'sport_id', x.sport_id, 'starts_at', x.starts_at,
             'place_name', pl.name, 'place_area', pl.area,
             'appeal_status', (select a.status from private.appeals a where a.user_id = v_uid and a.kind = 'show_up'
                                 and a.subject_id = x.id order by a.created_at desc limit 1))
           order by x.starts_at desc)
    from (select x.* from public.attendance t
          join public.activities x on x.id = t.activity_id
          where t.user_id = v_uid and t.status = 'confirmed' and x.status <> 'cancelled'
            and coalesce(x.ended_at, x.ends_at) <= now()
            and private.show_up_correction(v_uid, x.id) is null
          order by x.starts_at desc
          limit least(greatest(coalesce(p_limit, 20), 1), 50)) x
    left join public.places pl on pl.id = x.place_id), '[]'::jsonb));
end;
$$;

-- Appeals ------------------------------------------------------------------------------------------------------------

create or replace function public.submit_appeal(
  p_kind text,
  p_subject_id uuid,
  p_message text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid_any();
  v_prior jsonb;
  v_message text := btrim(coalesce(p_message, ''));
  v_ok boolean;
  v_open uuid;
  v_appeal private.appeals%rowtype;
  v_result jsonb;
begin
  if p_kind is null or p_kind not in ('account_pause', 'content_hidden', 'show_up') then
    perform private.fail('invalid_argument', 'kind');
  end if;
  -- Paused: only the pause itself can be appealed.
  if p_kind <> 'account_pause' then
    perform private.require_uid();
  end if;
  v_prior := private.idem_claim(v_uid, p_idempotency_key, 'submit_appeal');
  if v_prior is not null then
    return v_prior;
  end if;
  if char_length(v_message) not between 1 and 1000 then
    perform private.fail('invalid_argument', 'message');
  end if;
  v_ok := case p_kind
    when 'account_pause' then (private.active_pause(v_uid)).id = p_subject_id
    when 'content_hidden' then exists (select 1 from private.content_hides h where h.id = p_subject_id
                                         and h.owner_id = v_uid and h.restored_at is null)
    else exists (select 1 from public.attendance t join public.activities x on x.id = t.activity_id
                 where t.activity_id = p_subject_id and t.user_id = v_uid and t.status = 'confirmed'
                   and x.status <> 'cancelled' and coalesce(x.ended_at, x.ends_at) <= now()
                   and private.show_up_correction(v_uid, x.id) is null)
  end;
  if not coalesce(v_ok, false) then
    perform private.fail('appeal_not_allowed');
  end if;
  select a.id into v_open from private.appeals a
  where a.user_id = v_uid and a.kind = p_kind and a.subject_id = p_subject_id and a.status = 'open';
  if v_open is not null then
    perform private.fail('appeal_exists', v_open::text);
  end if;
  if (select count(*) from private.appeals a where a.user_id = v_uid and a.created_at > now() - interval '7 days') >= 5 then
    perform private.fail('appeal_rate_limited', '5');
  end if;
  insert into private.appeals (user_id, kind, subject_id, message)
  values (v_uid, p_kind, p_subject_id, v_message)
  returning * into v_appeal;
  perform private.emit('appeal_submitted', v_uid, jsonb_build_object('kind', p_kind));
  v_result := private.my_appeal_json(v_appeal);
  perform private.idem_store(v_uid, p_idempotency_key, v_result);
  return v_result;
end;
$$;

create or replace function public.my_appeals()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('items', coalesce((
    select jsonb_agg(private.my_appeal_json(a) order by a.created_at desc)
    from private.appeals a where a.user_id = (select private.require_uid_any())), '[]'::jsonb));
$$;

-- Privileges -----------------------------------------------------------------------------------------------------------

revoke all on function private.show_up_correction(uuid, uuid), private.show_up_record(uuid), private.trusted_host(uuid),
  private.my_appeal_json(private.appeals)
  from public, anon, authenticated;
revoke all on function public.passport_reputation(uuid), public.profile_reputation(uuid), public.my_account_status(),
  public.my_missed_games(integer), public.submit_appeal(text, uuid, text, uuid), public.my_appeals()
  from public, anon;
grant execute on function public.passport_reputation(uuid), public.profile_reputation(uuid), public.my_account_status(),
  public.my_missed_games(integer), public.submit_appeal(text, uuid, text, uuid), public.my_appeals()
  to authenticated, service_role;
