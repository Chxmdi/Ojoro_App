-- Polish (ACCOUNT): deleting an account also unlinks that person's analytics (owner decision).
-- Contract: docs/TRUST_CONTRACT.md ("Deleting your own account").
--
-- private.analytics_events has no reader in the database; anonymous server events already use a null
-- user_id (private.emit(…, null, …)), so null is the unlinked state (not the Former member placeholder,
-- which would merge everyone's deleted history into one "person"). In the same transaction as the
-- deletion, account_delete now:
--   * sets user_id to null on every row of theirs;
--   * strips their id from every payload: a key whose value is their id is dropped, and their id is
--     dropped from arrays, at any depth (payloads carry other people's ids too: opponents, invitees…).

-- j without any string equal to p_value: object keys holding it are removed, array elements equal to it
-- are removed, recursively.
create or replace function private.jsonb_strip_value(p_json jsonb, p_value text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  case jsonb_typeof(p_json)
    when 'object' then
      return coalesce((select jsonb_object_agg(e.key, private.jsonb_strip_value(e.value, p_value))
                       from jsonb_each(p_json) e
                       where not (jsonb_typeof(e.value) = 'string' and e.value #>> '{}' = p_value)), '{}'::jsonb);
    when 'array' then
      return coalesce((select jsonb_agg(private.jsonb_strip_value(e.value, p_value) order by e.ord)
                       from jsonb_array_elements(p_json) with ordinality e(value, ord)
                       where not (jsonb_typeof(e.value) = 'string' and e.value #>> '{}' = p_value)), '[]'::jsonb);
    else
      return p_json;
  end case;
end;
$$;

-- One person's analytics, unlinked. Returns how many rows changed.
create or replace function private.unlink_analytics(p_user_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  update private.analytics_events
     set user_id = case when user_id = p_user_id then null else user_id end,
         payload = case when payload::text like '%' || p_user_id::text || '%'
                        then private.jsonb_strip_value(payload, p_user_id::text) else payload end
   where user_id = p_user_id or payload::text like '%' || p_user_id::text || '%';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Service role: delete. Returns { status: 'deleted' | 'already_deleted' }; raises account_delete_staff or
-- account_delete_blocked (detail: the first blocker's kind) when something stops it.
create or replace function public.account_delete(p_user_id uuid, p_source text default 'app')
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_blockers jsonb;
  v_programs integer;
  v_source text := case when p_source in ('app', 'web') then p_source else 'other' end;
begin
  if p_user_id is null or p_user_id = private.former_member() then
    perform private.fail('invalid_argument', 'user_id');
  end if;
  perform 1 from auth.users u where u.id = p_user_id for update;
  if not found then
    return jsonb_build_object('status', 'already_deleted', 'blockers', '[]'::jsonb);
  end if;
  v_blockers := private.account_deletion_blockers(p_user_id);
  if v_blockers @> '[{"kind": "staff"}]'::jsonb then
    perform private.fail('account_delete_staff');
  elsif jsonb_array_length(v_blockers) > 0 then
    perform private.fail('account_delete_blocked', v_blockers -> 0 ->> 'kind');
  end if;
  select count(*) into v_programs from public.host_program_hosts h where h.user_id = p_user_id and h.role = 'owner';
  -- No personal data: no user id, name or phone. Only how it was asked for and what it touched.
  insert into private.trust_audit (actor_id, action, subject_kind, reason, detail)
  values (null, 'account_self_deleted', 'account', null,
          jsonb_build_object('source', v_source, 'owned_programs', v_programs));
  perform private.emit('account_deleted', null, jsonb_build_object('source', v_source));
  delete from auth.users where id = p_user_id;
  -- After the cascade (which can emit events of its own): their analytics stay counted but no longer
  -- point at them.
  perform private.unlink_analytics(p_user_id);
  return jsonb_build_object('status', 'deleted', 'blockers', '[]'::jsonb);
end;
$$;

revoke all on function private.jsonb_strip_value(jsonb, text) from public, anon, authenticated;
revoke all on function private.unlink_analytics(uuid) from public, anon, authenticated;
revoke all on function public.account_delete(uuid, text) from public, anon, authenticated;
grant execute on function public.account_delete(uuid, text) to service_role;
