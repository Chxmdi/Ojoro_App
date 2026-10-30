-- Step 8 (Trust): staff reads and writes for the admin web app. Contract: docs/TRUST_CONTRACT.md.
--
-- Every staff_* RPC checks the caller's staff grant (private.require_staff), writes an audit row in the same
-- transaction (reads of personal data too, so these reads are volatile), and every write takes an
-- idempotency key. Lists page with an opaque cursor (an offset today) and return {items, next_cursor}.

-- Shapes -------------------------------------------------------------------------------------------------------

create or replace function private.page_offset(p_cursor text)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_cursor is null or p_cursor = '' then
    return 0;
  end if;
  if p_cursor !~ '^o[0-9]{1,7}$' then
    perform private.fail('invalid_argument', 'cursor');
  end if;
  return substr(p_cursor, 2)::integer;
end;
$$;

create or replace function private.page_limit(p_limit integer, p_default integer default 50)
returns integer
language sql
immutable
set search_path = ''
as $$
  select least(greatest(coalesce(p_limit, p_default), 1), 100);
$$;

create or replace function private.case_summary(c private.moderation_cases)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'subject_kind', c.subject_kind, 'subject_id', c.subject_id,
    'status', c.status, 'severity', private.severity_label(c.severity_rank),
    'reasons', to_jsonb(c.reasons), 'report_count', c.report_count, 'reporter_count', c.reporter_count,
    'opened_at', c.opened_at, 'last_reported_at', c.last_reported_at, 'resolved_at', c.resolved_at,
    'preview', left(coalesce(c.snapshot ->> 'text', c.snapshot ->> 'title'), 140),
    'owner', case when c.owner_id is null then null
                  else private.person_brief(c.owner_id) || jsonb_build_object('paused', authz.is_paused(c.owner_id)) end,
    'assigned_to', case when c.assigned_to is null then null
                        else (select jsonb_build_object('id', p.id, 'display_name', p.display_name)
                              from public.profiles p where p.id = c.assigned_to) end,
    'content_hidden', exists (select 1 from private.content_hides h where h.subject_kind = c.subject_kind
                                and h.subject_id = c.subject_id and h.restored_at is null)
  );
$$;

create or replace function private.audit_entry(a private.trust_audit)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', a.id, 'at', a.at,
    'actor', case when a.actor_id is null then null else (select jsonb_build_object('id', p.id, 'display_name', p.display_name)
                                                          from public.profiles p where p.id = a.actor_id) end,
    'action', a.action, 'subject_kind', a.subject_kind, 'subject_id', a.subject_id,
    'target_user', case when a.target_user_id is null then null
                        else (select jsonb_build_object('id', p.id, 'display_name', p.display_name)
                              from public.profiles p where p.id = a.target_user_id) end,
    'case_id', a.case_id, 'appeal_id', a.appeal_id, 'reason', a.reason, 'detail', a.detail
  );
$$;

create or replace function private.pause_json(p private.account_pauses)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when p.id is null then null else jsonb_build_object(
    'id', p.id, 'reason', p.reason, 'note_to_user', p.note_to_user, 'staff_note', p.staff_note,
    'starts_at', p.starts_at, 'ends_at', p.ends_at, 'case_id', p.case_id,
    'created_by', private.person_brief(p.created_by),
    'restored_at', p.restored_at, 'restored_by', private.person_brief(p.restored_by),
    'restore_reason', p.restore_reason,
    'active', p.restored_at is null and p.starts_at <= now() and (p.ends_at is null or p.ends_at > now())
  ) end;
$$;

create or replace function private.appeal_summary(a private.appeals)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', a.id, 'kind', a.kind, 'status', a.status, 'user', private.person_brief(a.user_id),
    'subject_id', a.subject_id, 'message', left(a.message, 140), 'created_at', a.created_at,
    'decided_at', a.decided_at, 'decided_by', private.person_brief(a.decided_by), 'decision_note', a.decision_note
  );
$$;

create or replace function private.user_history(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'pauses', coalesce((select jsonb_agg(private.pause_json(p) order by p.created_at desc)
                        from private.account_pauses p where p.user_id = p_uid), '[]'::jsonb),
    'cases_against', jsonb_build_object(
      'total', (select count(*) from private.moderation_cases c where c.owner_id = p_uid),
      'actioned', (select count(*) from private.moderation_cases c where c.owner_id = p_uid and c.status = 'actioned'),
      'dismissed', (select count(*) from private.moderation_cases c where c.owner_id = p_uid and c.status = 'dismissed'),
      'open', (select count(*) from private.moderation_cases c where c.owner_id = p_uid and c.status in ('open', 'reviewing')),
      'recent', coalesce((select jsonb_agg(private.case_summary(c) order by c.opened_at desc)
                          from (select * from private.moderation_cases c where c.owner_id = p_uid
                                order by c.opened_at desc limit 20) c), '[]'::jsonb)),
    'reports_made', jsonb_build_object(
      'total', (select count(*) from public.reports r where r.reporter_id = p_uid),
      'last_30_days', (select count(*) from public.reports r where r.reporter_id = p_uid and r.created_at > now() - interval '30 days'),
      'dismissed', (select count(*) from public.reports r where r.reporter_id = p_uid and r.status = 'dismissed')),
    'hides', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'subject_kind', h.subject_kind, 'subject_id', h.subject_id,
                                                           'hidden_at', h.hidden_at, 'reason', h.reason, 'restored_at', h.restored_at)
                                        order by h.hidden_at desc)
                       from private.content_hides h where h.owner_id = p_uid), '[]'::jsonb),
    'appeals', coalesce((select jsonb_agg(private.appeal_summary(a) order by a.created_at desc)
                         from private.appeals a where a.user_id = p_uid), '[]'::jsonb),
    'corrections', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'activity_id', x.activity_id,
                                                                 'giver_id', x.giver_id, 'created_at', x.created_at, 'reason', x.reason)
                                              order by x.created_at desc)
                             from private.reputation_corrections x where x.user_id = p_uid), '[]'::jsonb),
    'blocked_by_count', (select count(*) from public.blocks b where b.blocked_id = p_uid)
  );
$$;

create or replace function private.profile_json(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', p.id, 'display_name', p.display_name, 'handle', p.handle, 'area', p.area,
                            'joined_at', p.created_at, 'onboarded', p.onboarding_completed_at is not null)
  from public.profiles p where p.id = p_uid;
$$;

-- A reputation signal that staff stopped counting (private.reputation_corrections 'signal_void').
create or replace function private.signal_voided(p_giver uuid, p_subject uuid, p_activity uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.reputation_corrections x
    where x.kind = 'signal_void' and x.user_id = p_subject and x.giver_id = p_giver
      and (x.activity_id is null or x.activity_id = p_activity)
  );
$$;

-- Who am I (any signed-in caller, paused or not) -----------------------------------------------------------------

create or replace function public.my_staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select authz.staff_role(auth.uid());
$$;

-- Reads ------------------------------------------------------------------------------------------------------------

create or replace function public.staff_queue(
  p_status text[] default array['open', 'reviewing'],
  p_severity text[] default null,
  p_kinds text[] default null,
  p_assigned text default null,
  p_limit integer default 50,
  p_cursor text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_staff();
  v_limit integer := private.page_limit(p_limit);
  v_offset integer := private.page_offset(p_cursor);
  v_status text[] := coalesce(p_status, array['open', 'reviewing']);
  v_items jsonb;
  v_n integer;
begin
  if p_assigned is not null and p_assigned not in ('me', 'unassigned') then
    perform private.fail('invalid_argument', 'assigned');
  end if;
  select coalesce(jsonb_agg(private.case_summary(x.c) order by x.ord), '[]'::jsonb), count(*)
    into v_items, v_n
  from (
    select c, row_number() over (
             order by (c.status in ('open', 'reviewing')) desc,
                      case when c.status in ('open', 'reviewing') then -c.severity_rank end,
                      case when c.status in ('open', 'reviewing') then c.opened_at end,
                      c.resolved_at desc nulls last, c.id) as ord
    from private.moderation_cases c
    where c.status = any (v_status)
      and (p_severity is null or private.severity_label(c.severity_rank) = any (p_severity))
      and (p_kinds is null or c.subject_kind::text = any (p_kinds))
      and (p_assigned is null or (p_assigned = 'me' and c.assigned_to = v_uid)
           or (p_assigned = 'unassigned' and c.assigned_to is null))
    order by 2
    offset v_offset limit v_limit + 1
  ) x;
  -- The extra row only says there is a next page.
  if v_n > v_limit then
    v_items := v_items - v_limit;
  end if;
  perform private.audit(v_uid, 'view_queue', null, null, null, null, null, null,
    jsonb_build_object('status', v_status, 'severity', p_severity, 'kinds', p_kinds, 'assigned', p_assigned,
                       'offset', v_offset, 'count', jsonb_array_length(v_items)));
  return jsonb_build_object(
    'items', v_items,
    'next_cursor', case when v_n > v_limit then 'o' || (v_offset + v_limit) end,
    'counts', jsonb_build_object(
      'open', (select count(*) from private.moderation_cases c where c.status = 'open'),
      'reviewing', (select count(*) from private.moderation_cases c where c.status = 'reviewing'),
      'high_open', (select count(*) from private.moderation_cases c where c.status in ('open', 'reviewing') and c.severity_rank = 3))
  );
end;
$$;

create or replace function public.staff_case(p_case_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_staff();
  c private.moderation_cases%rowtype;
  v_hide private.content_hides%rowtype;
begin
  select * into c from private.moderation_cases where id = p_case_id;
  if not found then
    perform private.fail('case_not_found');
  end if;
  select * into v_hide from private.content_hides h
  where h.subject_kind = c.subject_kind and h.subject_id = c.subject_id and h.restored_at is null;
  perform private.audit(v_uid, 'view_case', c.subject_kind::text, c.subject_id, c.owner_id, c.id);
  return jsonb_build_object(
    'case', private.case_summary(c) || jsonb_build_object(
      'resolution', case when c.status in ('actioned', 'dismissed') then c.status end,
      'resolution_note', c.resolution_note, 'resolved_by', private.person_brief(c.resolved_by),
      'assigned_at', c.assigned_at),
    'subject', private.subject_view(c.subject_kind, c.subject_id),
    'snapshot', c.snapshot,
    'reports', coalesce((select jsonb_agg(jsonb_build_object(
                   'id', r.id, 'reporter', private.person_brief(r.reporter_id), 'reason', r.reason, 'note', r.note,
                   'created_at', r.created_at, 'status', r.status) order by r.created_at desc)
                 from public.reports r where r.case_id = c.id), '[]'::jsonb),
    'related', coalesce((select jsonb_agg(private.case_summary(x) order by x.opened_at desc)
                 from (select * from private.moderation_cases x
                       where x.id <> c.id
                         and ((x.subject_kind = c.subject_kind and x.subject_id = c.subject_id)
                              or (c.owner_id is not null and x.owner_id = c.owner_id))
                       order by x.opened_at desc limit 20) x), '[]'::jsonb),
    'owner_history', case when c.owner_id is null then null else private.user_history(c.owner_id) end,
    'hide', case when v_hide.id is null then null else jsonb_build_object(
               'id', v_hide.id, 'hidden_at', v_hide.hidden_at, 'hidden_by', private.person_brief(v_hide.hidden_by),
               'reason', v_hide.reason) end,
    'actions', coalesce((select jsonb_agg(private.audit_entry(a) order by a.id desc)
                 from private.trust_audit a where a.case_id = c.id and a.action not like 'view\_%'), '[]'::jsonb)
  );
end;
$$;

create or replace function public.staff_user(p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_staff();
begin
  if not exists (select 1 from public.profiles where id = p_user_id) then
    perform private.fail('user_not_found');
  end if;
  perform private.audit(v_uid, 'view_user', 'profile', p_user_id, p_user_id);
  return jsonb_build_object(
    'profile', private.profile_json(p_user_id),
    'staff_role', authz.staff_role(p_user_id),
    'paused', private.pause_json(private.active_pause(p_user_id))
  ) || private.user_history(p_user_id);
end;
$$;

create or replace function public.staff_find_users(p_query text, p_limit integer default 20)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_staff();
  v_q text := lower(btrim(coalesce(p_query, '')));
  v_items jsonb;
begin
  if char_length(v_q) < 2 then
    perform private.fail('invalid_argument', 'query');
  end if;
  v_q := ltrim(v_q, '@');
  select coalesce(jsonb_agg(x.j order by x.rank, x.name), '[]'::jsonb) into v_items
  from (
    select private.profile_json(p.id) - 'joined_at' - 'onboarded'
             || jsonb_build_object('paused', authz.is_paused(p.id), 'staff_role', authz.staff_role(p.id)) as j,
           case when lower(p.handle) = v_q then 0 when lower(p.handle) like v_q || '%' then 1
                when lower(p.display_name) like v_q || '%' then 2 else 3 end as rank,
           coalesce(p.display_name, p.handle, '') as name
    from public.profiles p
    where lower(p.handle) like '%' || v_q || '%' or lower(p.display_name) like '%' || v_q || '%'
    order by 2, 3
    limit private.page_limit(p_limit, 20)
  ) x;
  perform private.audit(v_uid, 'find_users', null, null, null, null, null, null,
                        jsonb_build_object('query', v_q, 'count', jsonb_array_length(v_items)));
  return jsonb_build_object('items', v_items);
end;
$$;

create or replace function public.staff_appeals(
  p_status text[] default array['open'],
  p_kinds text[] default null,
  p_limit integer default 50,
  p_cursor text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_staff();
  v_limit integer := private.page_limit(p_limit);
  v_offset integer := private.page_offset(p_cursor);
  v_status text[] := coalesce(p_status, array['open']);
  v_items jsonb;
  v_n integer;
begin
  select coalesce(jsonb_agg(private.appeal_summary(x.a) order by x.ord), '[]'::jsonb), count(*)
    into v_items, v_n
  from (
    select a, row_number() over (order by (a.status = 'open') desc,
                                          case when a.status = 'open' then a.created_at end,
                                          a.decided_at desc nulls last, a.id) as ord
    from private.appeals a
    where a.status = any (v_status) and (p_kinds is null or a.kind = any (p_kinds))
    order by 2
    offset v_offset limit v_limit + 1
  ) x;
  if v_n > v_limit then
    v_items := v_items - v_limit;
  end if;
  perform private.audit(v_uid, 'view_appeals', null, null, null, null, null, null,
                        jsonb_build_object('status', v_status, 'kinds', p_kinds, 'offset', v_offset,
                                           'count', jsonb_array_length(v_items)));
  return jsonb_build_object(
    'items', v_items,
    'next_cursor', case when v_n > v_limit then 'o' || (v_offset + v_limit) end,
    'counts', jsonb_build_object('open', (select count(*) from private.appeals a where a.status = 'open'))
  );
end;
$$;

create or replace function public.staff_appeal(p_appeal_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_staff();
  a private.appeals%rowtype;
  v_subject jsonb;
  v_hide private.content_hides%rowtype;
  v_pause private.account_pauses%rowtype;
begin
  select * into a from private.appeals where id = p_appeal_id;
  if not found then
    perform private.fail('appeal_not_found');
  end if;
  if a.kind = 'account_pause' then
    select * into v_pause from private.account_pauses where id = a.subject_id;
    v_subject := jsonb_build_object('pause', private.pause_json(v_pause));
  elsif a.kind = 'content_hidden' then
    select * into v_hide from private.content_hides where id = a.subject_id;
    v_subject := jsonb_build_object(
      'hide', jsonb_build_object('id', v_hide.id, 'subject_kind', v_hide.subject_kind, 'subject_id', v_hide.subject_id,
                                 'hidden_at', v_hide.hidden_at, 'hidden_by', private.person_brief(v_hide.hidden_by),
                                 'reason', v_hide.reason, 'restored_at', v_hide.restored_at, 'case_id', v_hide.case_id),
      'content', private.subject_view(v_hide.subject_kind, v_hide.subject_id) || jsonb_build_object(
                   'text', coalesce(v_hide.original ->> 'body', v_hide.original -> 'row' ->> 'caption',
                                    private.subject_view(v_hide.subject_kind, v_hide.subject_id) ->> 'text')),
      'case', (select private.case_summary(c) from private.moderation_cases c where c.id = v_hide.case_id));
  else
    v_subject := (
      select jsonb_build_object(
        'activity_id', x.id, 'sport_id', x.sport_id, 'starts_at', x.starts_at, 'status', x.status,
        'place', (select jsonb_build_object('name', pl.name, 'area', pl.area) from public.places pl where pl.id = x.place_id),
        'host', (select jsonb_build_object('id', p.id, 'display_name', p.display_name) from public.profiles p where p.id = x.host_id),
        'attendance_status', (select t.status from public.attendance t where t.activity_id = x.id and t.user_id = a.user_id),
        'checked_in_count', x.checked_in_count, 'confirmed_count', x.confirmed_count)
      from public.activities x where x.id = a.subject_id);
  end if;
  perform private.audit(v_uid, 'view_appeal', a.kind, a.subject_id, a.user_id, null, a.id);
  return jsonb_build_object(
    'appeal', private.appeal_summary(a) || jsonb_build_object('message', a.message, 'correction_effect', a.correction_effect),
    'user', private.profile_json(a.user_id) || jsonb_build_object('paused', authz.is_paused(a.user_id)),
    'subject', v_subject,
    'actions', coalesce((select jsonb_agg(private.audit_entry(x) order by x.id desc)
                 from private.trust_audit x where x.appeal_id = a.id and x.action not like 'view\_%'), '[]'::jsonb)
  );
end;
$$;

create or replace function public.staff_audit_log(
  p_actor uuid default null,
  p_target_user uuid default null,
  p_actions text[] default null,
  p_case_id uuid default null,
  p_limit integer default 50,
  p_cursor text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_staff();
  v_limit integer := private.page_limit(p_limit);
  v_offset integer := private.page_offset(p_cursor);
  v_items jsonb;
  v_n integer;
begin
  select coalesce(jsonb_agg(private.audit_entry(x) order by x.id desc), '[]'::jsonb), count(*)
    into v_items, v_n
  from (select * from private.trust_audit a
        where (p_actor is null or a.actor_id = p_actor)
          and (p_target_user is null or a.target_user_id = p_target_user)
          and (p_actions is null or a.action = any (p_actions))
          and (p_case_id is null or a.case_id = p_case_id)
        order by a.id desc offset v_offset limit v_limit + 1) x;
  if v_n > v_limit then
    v_items := v_items - v_limit;
  end if;
  perform private.audit(v_uid, 'view_audit', null, null, p_target_user, p_case_id, null, null,
                        jsonb_build_object('actor', p_actor, 'actions', p_actions, 'offset', v_offset));
  return jsonb_build_object('items', v_items, 'next_cursor', case when v_n > v_limit then 'o' || (v_offset + v_limit) end);
end;
$$;

create or replace function public.staff_places(p_query text default null, p_sensitive boolean default null,
                                               p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_staff();
  v_q text := nullif(lower(btrim(coalesce(p_query, ''))), '');
begin
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'area', x.area, 'city', x.city,
                                        'sensitive', x.sensitive, 'sport_ids', to_jsonb(x.sport_ids)) order by x.name)
    from (select * from public.places pl
          where (v_q is null or lower(pl.name) like '%' || v_q || '%' or lower(coalesce(pl.area, '')) like '%' || v_q || '%')
            and (p_sensitive is null or pl.sensitive = p_sensitive)
          order by pl.name limit private.page_limit(p_limit)) x), '[]'::jsonb));
end;
$$;

-- Writes -------------------------------------------------------------------------------------------------------------

create or replace function public.staff_assign_case(p_case_id uuid, p_staff_id uuid default null,
                                                    p_idempotency_key uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_staff();
  v_prior jsonb := private.idem_claim(v_uid, p_idempotency_key, 'staff_assign_case');
  v_to uuid := coalesce(p_staff_id, v_uid);
  c private.moderation_cases%rowtype;
  v_result jsonb;
  v_changed boolean;
begin
  if v_prior is not null then
    return v_prior;
  end if;
  select * into c from private.moderation_cases where id = p_case_id for update;
  if not found then
    perform private.fail('case_not_found');
  end if;
  if c.status not in ('open', 'reviewing') then
    perform private.fail('case_closed');
  end if;
  if not authz.is_staff(v_to) then
    perform private.fail('invalid_argument', 'staff_id');
  end if;
  v_changed := c.assigned_to is distinct from v_to or c.status <> 'reviewing';
  if v_changed then
    update private.moderation_cases set status = 'reviewing', assigned_to = v_to, assigned_at = now() where id = c.id;
    update public.reports set status = 'reviewing' where case_id = c.id and status = 'open';
    perform private.audit(v_uid, 'assign_case', c.subject_kind::text, c.subject_id, c.owner_id, c.id, null, null,
                          jsonb_build_object('assigned_to', v_to, 'previous', c.assigned_to));
  end if;
  v_result := jsonb_build_object('case_id', c.id, 'status', 'reviewing', 'assigned_to', private.person_brief(v_to),
                                 'changed', v_changed);
  perform private.idem_store(v_uid, p_idempotency_key, v_result);
  return v_result;
end;
$$;

create or replace function public.staff_unassign_case(p_case_id uuid, p_idempotency_key uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_staff();
  v_prior jsonb := private.idem_claim(v_uid, p_idempotency_key, 'staff_unassign_case');
  c private.moderation_cases%rowtype;
  v_result jsonb;
  v_changed boolean;
begin
  if v_prior is not null then
    return v_prior;
  end if;
  select * into c from private.moderation_cases where id = p_case_id for update;
  if not found then
    perform private.fail('case_not_found');
  end if;
  if c.status not in ('open', 'reviewing') then
    perform private.fail('case_closed');
  end if;
  v_changed := c.status = 'reviewing';
  if v_changed then
    update private.moderation_cases set status = 'open', assigned_to = null, assigned_at = null where id = c.id;
    update public.reports set status = 'open' where case_id = c.id and status = 'reviewing';
    perform private.audit(v_uid, 'assign_case', c.subject_kind::text, c.subject_id, c.owner_id, c.id, null, null,
                          jsonb_build_object('assigned_to', null, 'previous', c.assigned_to));
  end if;
  v_result := jsonb_build_object('case_id', c.id, 'status', 'open', 'assigned_to', null, 'changed', v_changed);
  perform private.idem_store(v_uid, p_idempotency_key, v_result);
  return v_result;
end;
$$;

create or replace function public.staff_resolve_case(p_case_id uuid, p_outcome text, p_reason text,
                                                     p_idempotency_key uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_staff();
  v_prior jsonb := private.idem_claim(v_uid, p_idempotency_key, 'staff_resolve_case');
  v_reason text := private.trust_reason(p_reason);
  c private.moderation_cases%rowtype;
  v_result jsonb;
begin
  if v_prior is not null then
    return v_prior;
  end if;
  if p_outcome is null or p_outcome not in ('actioned', 'dismissed') then
    perform private.fail('invalid_argument', 'outcome');
  end if;
  select * into c from private.moderation_cases where id = p_case_id for update;
  if not found then
    perform private.fail('case_not_found');
  end if;
  if c.status = p_outcome then
    v_result := jsonb_build_object('case_id', c.id, 'status', c.status, 'changed', false);
  elsif c.status in ('actioned', 'dismissed') then
    perform private.fail('case_closed');
  else
    update private.moderation_cases
       set status = p_outcome, resolved_at = now(), resolved_by = v_uid, resolution_note = v_reason,
           assigned_to = coalesce(assigned_to, v_uid)
     where id = c.id;
    update public.reports set status = p_outcome where case_id = c.id;
    perform private.audit(v_uid, case p_outcome when 'actioned' then 'resolve_case' else 'dismiss_case' end,
                          c.subject_kind::text, c.subject_id, c.owner_id, c.id, null, v_reason,
                          jsonb_build_object('severity', private.severity_label(c.severity_rank),
                                             'report_count', c.report_count));
    perform private.emit('case_resolved', v_uid, jsonb_build_object(
      'outcome', p_outcome, 'severity', private.severity_label(c.severity_rank), 'kind', c.subject_kind,
      'minutes_open', round(extract(epoch from now() - c.opened_at) / 60)));
    v_result := jsonb_build_object('case_id', c.id, 'status', p_outcome, 'changed', true);
  end if;
  perform private.idem_store(v_uid, p_idempotency_key, v_result);
  return v_result;
end;
$$;

-- Hide / restore content ----------------------------------------------------------------------------------------------

create or replace function private.open_case_for(p_kind public.report_subject, p_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from private.moderation_cases c
  where c.subject_kind = p_kind and c.subject_id = p_id
  order by (c.status in ('open', 'reviewing')) desc, c.opened_at desc limit 1;
$$;

create or replace function public.staff_hide_content(
  p_subject_kind public.report_subject,
  p_subject_id uuid,
  p_reason text,
  p_case_id uuid default null,
  p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_staff();
  v_prior jsonb := private.idem_claim(v_uid, p_idempotency_key, 'staff_hide_content');
  v_reason text := private.trust_reason(p_reason);
  v_hide uuid;
  v_case uuid := coalesce(p_case_id, private.open_case_for(p_subject_kind, p_subject_id));
  v_owner uuid;
  v_original jsonb;
  v_deleted boolean;
  v_result jsonb;
  m public.messages%rowtype;
  u public.activity_updates%rowtype;
  cp public.challenge_posts%rowtype;
  cc public.challenge_comments%rowtype;
  mo public.moments%rowtype;
begin
  if v_prior is not null then
    return v_prior;
  end if;
  if p_subject_kind::text not in ('message', 'update', 'challenge_post', 'challenge_comment', 'moment') then
    perform private.fail('cannot_hide_kind', p_subject_kind::text);
  end if;
  if p_case_id is not null and not exists (select 1 from private.moderation_cases where id = p_case_id) then
    perform private.fail('case_not_found');
  end if;
  select h.id into v_hide from private.content_hides h
  where h.subject_kind = p_subject_kind and h.subject_id = p_subject_id and h.restored_at is null;
  if v_hide is not null then
    v_result := jsonb_build_object('hide_id', v_hide, 'changed', false);
    perform private.idem_store(v_uid, p_idempotency_key, v_result);
    return v_result;
  end if;

  case p_subject_kind::text
    when 'message' then
      select * into m from public.messages where id = p_subject_id for update;
      if not found then perform private.fail('subject_not_found'); end if;
      v_owner := m.sender_id; v_deleted := m.deleted_at is not null;
      v_original := jsonb_build_object('body', m.body, 'payload', m.payload, 'mention_ids', to_jsonb(m.mention_ids),
                                       'deleted_at', m.deleted_at);
      update public.messages set body = null, deleted_at = coalesce(deleted_at, now()), mention_ids = '{}', payload = null
       where id = m.id;
    when 'update' then
      select * into u from public.activity_updates where id = p_subject_id for update;
      if not found then perform private.fail('subject_not_found'); end if;
      if u.author_id is null then perform private.fail('cannot_hide_kind', 'system'); end if;
      v_owner := u.author_id; v_deleted := u.deleted_at is not null;
      v_original := jsonb_build_object('body', u.body, 'deleted_at', u.deleted_at);
      update public.activity_updates set body = null, deleted_at = coalesce(deleted_at, now()) where id = u.id;
    when 'challenge_post' then
      select * into cp from public.challenge_posts where id = p_subject_id for update;
      if not found then perform private.fail('subject_not_found'); end if;
      if cp.author_id is null then perform private.fail('cannot_hide_kind', 'system'); end if;
      v_owner := cp.author_id; v_deleted := cp.deleted_at is not null;
      v_original := jsonb_build_object('body', cp.body, 'stats', cp.stats, 'deleted_at', cp.deleted_at);
      update public.challenge_posts set body = null, stats = null, deleted_at = coalesce(deleted_at, now()) where id = cp.id;
    when 'challenge_comment' then
      select * into cc from public.challenge_comments where id = p_subject_id for update;
      if not found then perform private.fail('subject_not_found'); end if;
      v_owner := cc.author_id; v_deleted := cc.deleted_at is not null;
      v_original := jsonb_build_object('body', cc.body, 'deleted_at', cc.deleted_at);
      update public.challenge_comments set body = null, deleted_at = coalesce(deleted_at, now()) where id = cc.id;
      if not v_deleted then
        if cc.parent_id is not null then
          update public.challenge_comments set reply_count = greatest(reply_count - 1, 0) where id = cc.parent_id;
        end if;
        perform private.challenge_recount(cc.event_id);
      end if;
    when 'moment' then
      select * into mo from public.moments where id = p_subject_id for update;
      if not found then perform private.fail('subject_not_found'); end if;
      v_owner := mo.author_id; v_deleted := false;
      v_original := jsonb_build_object(
        'row', to_jsonb(mo),
        'tags', coalesce((select jsonb_agg(to_jsonb(t)) from public.moment_tags t where t.moment_id = mo.id), '[]'::jsonb));
      delete from public.moments where id = mo.id;
  end case;

  insert into private.content_hides (subject_kind, subject_id, owner_id, case_id, original, was_deleted, reason, hidden_by)
  values (p_subject_kind, p_subject_id, v_owner, v_case, v_original, v_deleted, v_reason, v_uid)
  returning id into v_hide;
  perform private.audit(v_uid, 'hide_content', p_subject_kind::text, p_subject_id, v_owner, v_case, null, v_reason,
                        jsonb_build_object('hide_id', v_hide, 'was_deleted', v_deleted));
  perform private.emit('content_hidden', v_uid, jsonb_build_object('kind', p_subject_kind, 'case_id', v_case));
  v_result := jsonb_build_object('hide_id', v_hide, 'changed', true);
  perform private.idem_store(v_uid, p_idempotency_key, v_result);
  return v_result;
end;
$$;

-- Put hidden content back (shared by staff_restore_content and upheld appeals). Returns false if it wasn't hidden.
create or replace function private.restore_hide(p_hide_id uuid, p_actor uuid, p_reason text, p_appeal_id uuid default null)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  h private.content_hides%rowtype;
  v_parent uuid;
  v_event uuid;
  v_back boolean := false;
begin
  select * into h from private.content_hides where id = p_hide_id for update;
  if not found then
    perform private.fail('hide_not_found');
  end if;
  if h.restored_at is not null then
    return false;
  end if;
  if not h.was_deleted then
    case h.subject_kind::text
      when 'message' then
        update public.messages
           set body = h.original ->> 'body', payload = h.original -> 'payload',
               mention_ids = coalesce(array(select jsonb_array_elements_text(h.original -> 'mention_ids'))::uuid[], '{}'),
               deleted_at = null
         where id = h.subject_id and h.original ->> 'body' is not null;
        v_back := found;
      when 'update' then
        update public.activity_updates set body = h.original ->> 'body', deleted_at = null
         where id = h.subject_id and h.original ->> 'body' is not null;
        v_back := found;
      when 'challenge_post' then
        update public.challenge_posts set body = h.original ->> 'body', stats = h.original -> 'stats', deleted_at = null
         where id = h.subject_id;
        v_back := found;
      when 'challenge_comment' then
        update public.challenge_comments set body = h.original ->> 'body', deleted_at = null
         where id = h.subject_id and h.original ->> 'body' is not null
         returning parent_id, event_id into v_parent, v_event;
        v_back := found;
        if v_back then
          if v_parent is not null then
            update public.challenge_comments set reply_count = reply_count + 1 where id = v_parent;
          end if;
          perform private.challenge_recount(v_event);
        end if;
      when 'moment' then
        if exists (select 1 from public.activities where id = (h.original -> 'row' ->> 'activity_id')::uuid)
           and exists (select 1 from public.profiles where id = (h.original -> 'row' ->> 'author_id')::uuid) then
          insert into public.moments
          select * from jsonb_populate_record(null::public.moments, h.original -> 'row')
          on conflict do nothing;
          v_back := found;
          if v_back then
            insert into public.moment_tags
            select t.* from jsonb_populate_recordset(null::public.moment_tags, h.original -> 'tags') t
            where exists (select 1 from public.profiles p where p.id = t.user_id)
            on conflict do nothing;
          end if;
        end if;
    end case;
  end if;
  update private.content_hides set restored_at = now(), restored_by = p_actor, restore_reason = p_reason where id = h.id;
  perform private.audit(p_actor, 'restore_content', h.subject_kind::text, h.subject_id, h.owner_id, h.case_id, p_appeal_id,
                        p_reason, jsonb_build_object('hide_id', h.id, 'put_back', v_back));
  perform private.emit('content_restored', p_actor, jsonb_build_object('kind', h.subject_kind, 'put_back', v_back));
  return true;
end;
$$;

create or replace function public.staff_restore_content(p_hide_id uuid, p_reason text, p_idempotency_key uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_staff();
  v_prior jsonb := private.idem_claim(v_uid, p_idempotency_key, 'staff_restore_content');
  v_reason text := private.trust_reason(p_reason);
  v_result jsonb;
begin
  if v_prior is not null then
    return v_prior;
  end if;
  v_result := jsonb_build_object('hide_id', p_hide_id, 'changed', private.restore_hide(p_hide_id, v_uid, v_reason));
  perform private.idem_store(v_uid, p_idempotency_key, v_result);
  return v_result;
end;
$$;

-- Pause / restore accounts -----------------------------------------------------------------------------------------------

create or replace function private.end_pause(p_uid uuid, p_actor uuid, p_reason text, p_appeal_id uuid default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v private.account_pauses%rowtype := private.active_pause(p_uid);
begin
  if v.id is null then
    return null;
  end if;
  update private.account_pauses set restored_at = now(), restored_by = p_actor, restore_reason = p_reason where id = v.id;
  perform private.audit(p_actor, 'restore_account', 'profile', p_uid, p_uid, v.case_id, p_appeal_id, p_reason,
                        jsonb_build_object('pause_id', v.id));
  perform private.emit('account_restored', p_actor, jsonb_build_object('pause_id', v.id));
  return v.id;
end;
$$;

create or replace function public.staff_pause_account(
  p_user_id uuid,
  p_reason_code public.report_reason,
  p_reason text,
  p_note_to_user text default null,
  p_ends_at timestamptz default null,
  p_case_id uuid default null,
  p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_staff();
  v_prior jsonb := private.idem_claim(v_uid, p_idempotency_key, 'staff_pause_account');
  v_reason text := private.trust_reason(p_reason);
  v_note text := nullif(btrim(p_note_to_user), '');
  v_id uuid;
  v_result jsonb;
begin
  if v_prior is not null then
    return v_prior;
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    perform private.fail('user_not_found');
  end if;
  if authz.is_staff(p_user_id) then
    perform private.fail('cannot_pause_staff');
  end if;
  if p_reason_code is null then
    perform private.fail('invalid_argument', 'reason_code');
  end if;
  if char_length(v_note) > 500 then
    perform private.fail('invalid_argument', 'note_to_user');
  end if;
  if p_ends_at is not null and (p_ends_at <= now() or p_ends_at > now() + interval '365 days') then
    perform private.fail('pause_end_invalid');
  end if;
  if p_case_id is not null and not exists (select 1 from private.moderation_cases where id = p_case_id) then
    perform private.fail('case_not_found');
  end if;
  perform private.end_pause(p_user_id, v_uid, 'Replaced');
  insert into private.account_pauses (user_id, reason, note_to_user, staff_note, case_id, ends_at, created_by)
  values (p_user_id, p_reason_code, v_note, v_reason, p_case_id, p_ends_at, v_uid)
  returning id into v_id;
  perform private.audit(v_uid, 'pause_account', 'profile', p_user_id, p_user_id, p_case_id, null, v_reason,
                        jsonb_build_object('pause_id', v_id, 'reason_code', p_reason_code, 'ends_at', p_ends_at,
                                           'note_to_user', v_note));
  perform private.emit('account_paused', v_uid, jsonb_build_object('reason', p_reason_code, 'has_end', p_ends_at is not null));
  v_result := jsonb_build_object('pause_id', v_id, 'ends_at', p_ends_at, 'changed', true);
  perform private.idem_store(v_uid, p_idempotency_key, v_result);
  return v_result;
end;
$$;

create or replace function public.staff_restore_account(p_user_id uuid, p_reason text, p_idempotency_key uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_staff();
  v_prior jsonb := private.idem_claim(v_uid, p_idempotency_key, 'staff_restore_account');
  v_reason text := private.trust_reason(p_reason);
  v_id uuid;
  v_result jsonb;
begin
  if v_prior is not null then
    return v_prior;
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    perform private.fail('user_not_found');
  end if;
  v_id := private.end_pause(p_user_id, v_uid, v_reason);
  v_result := jsonb_build_object('pause_id', v_id, 'changed', v_id is not null);
  perform private.idem_store(v_uid, p_idempotency_key, v_result);
  return v_result;
end;
$$;

-- Appeals ---------------------------------------------------------------------------------------------------------------

create or replace function public.staff_decide_appeal(
  p_appeal_id uuid,
  p_decision text,
  p_reason text,
  p_note_to_user text default null,
  p_effect text default null,
  p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_staff();
  v_prior jsonb := private.idem_claim(v_uid, p_idempotency_key, 'staff_decide_appeal');
  v_reason text := private.trust_reason(p_reason);
  v_note text := nullif(btrim(p_note_to_user), '');
  a private.appeals%rowtype;
  v_effect text;
  v_result jsonb;
  v_detail jsonb := '{}'::jsonb;
begin
  if v_prior is not null then
    return v_prior;
  end if;
  if p_decision is null or p_decision not in ('upheld', 'denied') then
    perform private.fail('invalid_argument', 'decision');
  end if;
  if char_length(v_note) > 500 then
    perform private.fail('invalid_argument', 'note_to_user');
  end if;
  select * into a from private.appeals where id = p_appeal_id for update;
  if not found then
    perform private.fail('appeal_not_found');
  end if;
  if a.status = p_decision then
    v_result := jsonb_build_object('appeal_id', a.id, 'status', a.status, 'changed', false);
    perform private.idem_store(v_uid, p_idempotency_key, v_result);
    return v_result;
  elsif a.status <> 'open' then
    perform private.fail('appeal_closed');
  end if;
  if p_decision = 'upheld' then
    if a.kind = 'account_pause' then
      if exists (select 1 from private.account_pauses p where p.id = a.subject_id and p.user_id = a.user_id) then
        v_detail := jsonb_build_object('restored_pause',
          private.end_pause(a.user_id, v_uid, 'Appeal upheld: ' || v_reason, a.id));
      end if;
    elsif a.kind = 'content_hidden' then
      v_detail := jsonb_build_object('restored_content', private.restore_hide(a.subject_id, v_uid, 'Appeal upheld: ' || v_reason, a.id));
    else
      v_effect := coalesce(p_effect, 'attended');
      if v_effect not in ('attended', 'excused') then
        perform private.fail('invalid_argument', 'effect');
      end if;
      insert into private.reputation_corrections (kind, user_id, activity_id, appeal_id, reason, created_by)
      values ('show_up_' || v_effect, a.user_id, a.subject_id, a.id, v_reason, v_uid);
      perform private.audit(v_uid, 'correct_show_up', 'activity', a.subject_id, a.user_id, null, a.id, v_reason,
                            jsonb_build_object('effect', v_effect));
    end if;
  end if;
  update private.appeals
     set status = p_decision, decision_note = v_note, correction_effect = v_effect, decided_by = v_uid, decided_at = now()
   where id = a.id;
  perform private.audit(v_uid, 'decide_appeal', a.kind, a.subject_id, a.user_id, null, a.id, v_reason,
                        v_detail || jsonb_build_object('decision', p_decision, 'note_to_user', v_note, 'effect', v_effect));
  perform private.emit('appeal_decided', v_uid, jsonb_build_object('kind', a.kind, 'decision', p_decision));
  v_result := jsonb_build_object('appeal_id', a.id, 'status', p_decision, 'changed', true);
  perform private.idem_store(v_uid, p_idempotency_key, v_result);
  return v_result;
end;
$$;

-- Reputation: stop counting signals one person gave another (never delete them) ----------------------------------------

create or replace function public.staff_void_reputation(
  p_subject_id uuid,
  p_giver_id uuid,
  p_reason text,
  p_activity_id uuid default null,
  p_case_id uuid default null,
  p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_staff();
  v_prior jsonb := private.idem_claim(v_uid, p_idempotency_key, 'staff_void_reputation');
  v_reason text := private.trust_reason(p_reason);
  v_n integer;
  v_result jsonb;
begin
  if v_prior is not null then
    return v_prior;
  end if;
  if not exists (select 1 from public.profiles where id = p_subject_id)
     or not exists (select 1 from public.profiles where id = p_giver_id) then
    perform private.fail('user_not_found');
  end if;
  select count(*) into v_n from public.reputation_signals r
  where r.subject_id = p_subject_id and r.giver_id = p_giver_id
    and (p_activity_id is null or r.activity_id = p_activity_id)
    and not private.signal_voided(r.giver_id, r.subject_id, r.activity_id);
  if v_n > 0 then
    insert into private.reputation_corrections (kind, user_id, giver_id, activity_id, case_id, reason, created_by)
    values ('signal_void', p_subject_id, p_giver_id, p_activity_id, p_case_id, v_reason, v_uid);
    perform private.audit(v_uid, 'void_reputation', 'profile', p_subject_id, p_subject_id, p_case_id, null, v_reason,
                          jsonb_build_object('giver_id', p_giver_id, 'activity_id', p_activity_id, 'signals', v_n));
    perform private.emit('reputation_voided', v_uid, jsonb_build_object('signals', v_n));
  end if;
  v_result := jsonb_build_object('voided', v_n, 'changed', v_n > 0);
  perform private.idem_store(v_uid, p_idempotency_key, v_result);
  return v_result;
end;
$$;

-- Places ---------------------------------------------------------------------------------------------------------------

create or replace function public.staff_set_place_sensitive(p_place_id uuid, p_sensitive boolean, p_reason text,
                                                            p_idempotency_key uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_staff();
  v_prior jsonb := private.idem_claim(v_uid, p_idempotency_key, 'staff_set_place_sensitive');
  v_reason text := private.trust_reason(p_reason);
  v_old boolean;
  v_result jsonb;
begin
  if v_prior is not null then
    return v_prior;
  end if;
  if p_sensitive is null then
    perform private.fail('invalid_argument', 'sensitive');
  end if;
  select sensitive into v_old from public.places where id = p_place_id for update;
  if not found then
    perform private.fail('place_unknown');
  end if;
  if v_old is distinct from p_sensitive then
    update public.places set sensitive = p_sensitive where id = p_place_id;
    perform private.audit(v_uid, 'set_place_sensitive', 'place', p_place_id, null, null, null, v_reason,
                          jsonb_build_object('sensitive', p_sensitive));
  end if;
  v_result := jsonb_build_object('place_id', p_place_id, 'sensitive', p_sensitive, 'changed', v_old is distinct from p_sensitive);
  perform private.idem_store(v_uid, p_idempotency_key, v_result);
  return v_result;
end;
$$;

-- Staff roles (admins) ---------------------------------------------------------------------------------------------------

create or replace function public.staff_set_role(p_user_id uuid, p_role text, p_reason text,
                                                 p_idempotency_key uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_staff(true);
  v_prior jsonb := private.idem_claim(v_uid, p_idempotency_key, 'staff_set_role');
  v_reason text := private.trust_reason(p_reason);
  v_old text := authz.staff_role(p_user_id);
  v_changed boolean;
  v_result jsonb;
begin
  if v_prior is not null then
    return v_prior;
  end if;
  if p_user_id = v_uid then
    perform private.fail('invalid_argument', 'self');
  end if;
  if p_role is not null and p_role not in ('moderator', 'admin') then
    perform private.fail('invalid_argument', 'role');
  end if;
  if v_old = 'admin' and p_role is distinct from 'admin'
     and (select count(*) from private.staff_members s where s.role = 'admin') <= 1 then
    perform private.fail('staff_last_admin');
  end if;
  if p_role is null then
    v_changed := private.revoke_staff(p_user_id, v_reason);
  else
    if authz.is_paused(p_user_id) then
      perform private.fail('invalid_argument', 'paused');
    end if;
    v_changed := private.grant_staff(p_user_id, p_role, v_reason);
  end if;
  v_result := jsonb_build_object('user_id', p_user_id, 'role', p_role, 'changed', v_changed);
  perform private.idem_store(v_uid, p_idempotency_key, v_result);
  return v_result;
end;
$$;

-- Privileges -------------------------------------------------------------------------------------------------------------

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.prokind = 'f'
      and p.proname in ('page_offset', 'page_limit', 'case_summary', 'audit_entry', 'pause_json', 'appeal_summary',
                        'user_history', 'profile_json', 'open_case_for', 'restore_hide', 'end_pause',
                        'signal_voided')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and (p.proname like 'staff\_%' or p.proname = 'my_staff_role')
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end;
$$;
