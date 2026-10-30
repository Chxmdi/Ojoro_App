-- Step 8 (Trust and safety, PRD §11.1, §11.3, §9.17, §20): staff, the moderation queue, hidden content,
-- paused accounts, appeals, reputation corrections and an audit log nobody can edit.
-- Contract: docs/TRUST_CONTRACT.md.
--
-- Every table here lives in `private`: no client role can read or write it. Staff reach it only through
-- the staff_* RPCs (20261031040200_trust_staff.sql), which check the caller's staff grant server-side.
-- The append-only tables have no foreign keys to profiles, so an account deletion never needs to edit
-- them (and their immutability triggers never block one).

-- Staff -------------------------------------------------------------------------------------------------

create table private.staff_members (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role text not null check (role in ('moderator', 'admin')),
  granted_by uuid,
  granted_at timestamptz not null default now(),
  note text check (char_length(note) <= 500)
);
comment on table private.staff_members is
  'Ojoro staff (moderation). Granted with private.grant_staff() or staff_set_role (admins). Never in the JWT.';

-- Moderation queue: one case per reported subject while open --------------------------------------------

create table private.moderation_cases (
  id uuid primary key default gen_random_uuid(),
  subject_kind public.report_subject not null,
  subject_id uuid not null,
  -- The person responsible (author, sender, creator, host…); null for places and Ojoro's own posts.
  owner_id uuid references public.profiles (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'reviewing', 'actioned', 'dismissed')),
  -- 3 high, 2 medium, 1 low. Only goes up while the case is open.
  severity_rank smallint not null default 1 check (severity_rank between 1 and 3),
  reasons public.report_reason[] not null default '{}',
  report_count integer not null default 0,
  reporter_count integer not null default 0,
  -- The reported content as staff first saw it (private.subject_view), refreshed while it exists.
  snapshot jsonb,
  opened_at timestamptz not null default now(),
  last_reported_at timestamptz not null default now(),
  assigned_to uuid references public.profiles (id) on delete set null,
  assigned_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolution_note text check (char_length(resolution_note) <= 500),
  check ((status in ('actioned', 'dismissed')) = (resolved_at is not null))
);
create unique index moderation_cases_one_open_idx on private.moderation_cases (subject_kind, subject_id)
  where status in ('open', 'reviewing');
create index moderation_cases_queue_idx on private.moderation_cases (status, severity_rank desc, opened_at, id);
create index moderation_cases_owner_idx on private.moderation_cases (owner_id, opened_at desc);
create index moderation_cases_resolved_idx on private.moderation_cases (resolved_at desc) where resolved_at is not null;

-- Each report joins a case (set by trigger, 20261031040100_trust_enforcement.sql).
alter table public.reports add column if not exists case_id uuid
  references private.moderation_cases (id) on delete set null;
create index if not exists reports_case_idx on public.reports (case_id);
create index if not exists reports_subject_idx on public.reports (subject_kind, subject_id);

-- Hidden content ------------------------------------------------------------------------------------------

create table private.content_hides (
  id uuid primary key default gen_random_uuid(),
  subject_kind public.report_subject not null
    check (subject_kind in ('message', 'update', 'challenge_post', 'challenge_comment', 'moment')),
  subject_id uuid not null,
  owner_id uuid,
  case_id uuid references private.moderation_cases (id) on delete set null,
  -- What was there (body, payload, the moment row and its tags…), so a restore puts it back.
  original jsonb not null default '{}',
  -- The author had already deleted it: a restore leaves it deleted.
  was_deleted boolean not null default false,
  reason text not null check (char_length(reason) between 1 and 500),
  hidden_by uuid,
  hidden_at timestamptz not null default now(),
  restored_at timestamptz,
  restored_by uuid,
  restore_reason text check (char_length(restore_reason) <= 500)
);
create unique index content_hides_active_idx on private.content_hides (subject_kind, subject_id)
  where restored_at is null;
create index content_hides_owner_idx on private.content_hides (owner_id, hidden_at desc);

-- Paused accounts -----------------------------------------------------------------------------------------

create table private.account_pauses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  reason public.report_reason not null,
  -- Shown to them on the paused screen.
  note_to_user text check (char_length(note_to_user) between 1 and 500),
  -- Staff only.
  staff_note text not null check (char_length(staff_note) between 1 and 500),
  case_id uuid references private.moderation_cases (id) on delete set null,
  starts_at timestamptz not null default now(),
  -- Null: until restored.
  ends_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  restored_at timestamptz,
  restored_by uuid,
  restore_reason text check (char_length(restore_reason) <= 500),
  check (ends_at is null or ends_at > starts_at)
);
create index account_pauses_user_idx on private.account_pauses (user_id, created_at desc);
create index account_pauses_open_idx on private.account_pauses (user_id) where restored_at is null;

-- Appeals -------------------------------------------------------------------------------------------------

create table private.appeals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('account_pause', 'content_hidden', 'show_up')),
  -- account_pause: the pause id; content_hidden: the hide id; show_up: the activity id.
  subject_id uuid not null,
  message text not null check (char_length(message) between 1 and 1000),
  status text not null default 'open' check (status in ('open', 'upheld', 'denied')),
  -- Words from staff, shown to them.
  decision_note text check (char_length(decision_note) <= 500),
  -- show_up appeals upheld: 'attended' | 'excused'.
  correction_effect text check (correction_effect in ('attended', 'excused')),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'open') = (decided_at is null))
);
create unique index appeals_one_open_idx on private.appeals (user_id, kind, subject_id) where status = 'open';
create index appeals_queue_idx on private.appeals (status, created_at, id);
create index appeals_user_idx on private.appeals (user_id, created_at desc);

-- Reputation corrections (append-only; the reads apply them, nothing else changes) ------------------------

create table private.reputation_corrections (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('show_up_attended', 'show_up_excused', 'signal_void')),
  -- Whose record it corrects.
  user_id uuid not null,
  activity_id uuid,
  -- signal_void: the signals this person gave user_id (all games, or activity_id only).
  giver_id uuid,
  appeal_id uuid,
  case_id uuid,
  reason text not null check (char_length(reason) between 1 and 500),
  created_by uuid,
  created_at timestamptz not null default now(),
  check ((kind = 'signal_void') = (giver_id is not null)),
  check (kind = 'signal_void' or activity_id is not null)
);
create index reputation_corrections_user_idx on private.reputation_corrections (user_id, kind);

-- Audit log (append-only) -----------------------------------------------------------------------------------

create table private.trust_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default clock_timestamp(),
  -- Null: SQL / system (private.grant_staff run by an operator, a pause ending by itself).
  actor_id uuid,
  action text not null,
  subject_kind text,
  subject_id uuid,
  target_user_id uuid,
  case_id uuid,
  appeal_id uuid,
  reason text,
  detail jsonb not null default '{}'
);
create index trust_audit_at_idx on private.trust_audit (id desc);
create index trust_audit_actor_idx on private.trust_audit (actor_id, id desc);
create index trust_audit_target_idx on private.trust_audit (target_user_id, id desc);
create index trust_audit_case_idx on private.trust_audit (case_id, id desc) where case_id is not null;
create index trust_audit_appeal_idx on private.trust_audit (appeal_id, id desc) where appeal_id is not null;
create index trust_audit_subject_idx on private.trust_audit (subject_id, id desc) where subject_id is not null;

create or replace function private.trust_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Seeds may rebuild their own sample rows (same switch as the host ops audit).
  if tg_op = 'DELETE' and current_setting('ojoro.seed_reset', true) = 'on' then
    return old;
  end if;
  raise exception using errcode = 'P0001', message = 'audit_immutable', detail = tg_table_name || ' rows are final';
end;
$$;

create trigger trust_audit_immutable before update or delete on private.trust_audit
  for each row execute function private.trust_append_only();
create trigger trust_audit_no_truncate before truncate on private.trust_audit
  for each statement execute function private.trust_append_only();
create trigger reputation_corrections_immutable before update or delete on private.reputation_corrections
  for each row execute function private.trust_append_only();
create trigger reputation_corrections_no_truncate before truncate on private.reputation_corrections
  for each statement execute function private.trust_append_only();

-- Helpers ---------------------------------------------------------------------------------------------------

create or replace function authz.staff_role(p_uid uuid default auth.uid())
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.role from private.staff_members s where s.user_id = p_uid;
$$;

create or replace function authz.is_staff(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_uid is not null and exists (select 1 from private.staff_members s where s.user_id = p_uid);
$$;

-- Paused right now: not restored, started, not past its end.
create or replace function authz.is_paused(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_uid is not null and exists (
    select 1 from private.account_pauses p
    where p.user_id = p_uid and p.restored_at is null and p.starts_at <= now()
      and (p.ends_at is null or p.ends_at > now())
  );
$$;

create or replace function private.active_pause(p_uid uuid)
returns private.account_pauses
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from private.account_pauses p
  where p.user_id = p_uid and p.restored_at is null and p.starts_at <= now()
    and (p.ends_at is null or p.ends_at > now())
  order by p.created_at desc
  limit 1;
$$;

-- Every app RPC starts with this. Now it also stops a paused account (PRD §11.1): reads and writes alike,
-- with the end time (or '') as detail. The exempt RPCs (my_account_status, my_appeals, submit_appeal,
-- my_staff_role) use private.require_uid_any() instead.
create or replace function private.require_uid()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ends timestamptz;
begin
  if v_uid is null then
    perform private.fail('not_authenticated');
  end if;
  if authz.is_paused(v_uid) then
    select p.ends_at into v_ends from private.active_pause(v_uid) p;
    perform private.fail('account_paused',
      coalesce(to_char(v_ends at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), ''));
  end if;
  return v_uid;
end;
$$;

create or replace function private.require_uid_any()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    perform private.fail('not_authenticated');
  end if;
  return v_uid;
end;
$$;

-- Blocks hide people from each other in both directions. A paused account is hidden from everyone the
-- same way (every surface that respects blocks respects pauses), never from itself.
create or replace function authz.is_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b) or (b.blocker_id = p_b and b.blocked_id = p_a)
  ) or (
    p_a is distinct from p_b
    and exists (
      select 1 from private.account_pauses p
      where p.user_id in (p_a, p_b) and p.restored_at is null and p.starts_at <= now()
        and (p.ends_at is null or p.ends_at > now())
    )
  );
$$;

-- The staff caller (any role, or admin only). Staff can't be paused, so this never meets a pause.
create or replace function private.require_staff(p_admin boolean default false)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    perform private.fail('not_authenticated');
  end if;
  v_role := authz.staff_role(v_uid);
  if v_role is null then
    perform private.fail('not_staff');
  end if;
  if p_admin and v_role <> 'admin' then
    perform private.fail('not_admin');
  end if;
  return v_uid;
end;
$$;

create or replace function private.trust_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then
    perform private.fail('reason_required');
  end if;
  return btrim(p_reason);
end;
$$;

create or replace function private.audit(
  p_actor uuid,
  p_action text,
  p_subject_kind text default null,
  p_subject_id uuid default null,
  p_target_user uuid default null,
  p_case_id uuid default null,
  p_appeal_id uuid default null,
  p_reason text default null,
  p_detail jsonb default '{}'
)
returns bigint
language sql
volatile
security definer
set search_path = ''
as $$
  insert into private.trust_audit (actor_id, action, subject_kind, subject_id, target_user_id, case_id, appeal_id,
                                   reason, detail)
  values (p_actor, p_action, p_subject_kind, p_subject_id, p_target_user, p_case_id, p_appeal_id, p_reason,
          coalesce(p_detail, '{}'))
  returning id;
$$;

-- Operators grant the first admin of an environment with SQL (service role / psql). Audited, null actor.
create or replace function private.grant_staff(p_user_id uuid, p_role text, p_reason text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_old text := authz.staff_role(p_user_id);
begin
  if p_role not in ('moderator', 'admin') then
    perform private.fail('invalid_argument', 'role');
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    perform private.fail('user_not_found');
  end if;
  if v_old is not distinct from p_role then
    return false;
  end if;
  insert into private.staff_members (user_id, role, granted_by, note)
  values (p_user_id, p_role, auth.uid(), private.trust_reason(p_reason))
  on conflict (user_id) do update set role = excluded.role, granted_by = excluded.granted_by,
                                      granted_at = now(), note = excluded.note;
  perform private.audit(auth.uid(), 'grant_staff', 'profile', p_user_id, p_user_id, null, null, p_reason,
                        jsonb_build_object('role', p_role, 'previous_role', v_old));
  return true;
end;
$$;

create or replace function private.revoke_staff(p_user_id uuid, p_reason text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_old text := authz.staff_role(p_user_id);
begin
  if v_old is null then
    return false;
  end if;
  perform private.trust_reason(p_reason);
  delete from private.staff_members where user_id = p_user_id;
  perform private.audit(auth.uid(), 'revoke_staff', 'profile', p_user_id, p_user_id, null, null, p_reason,
                        jsonb_build_object('previous_role', v_old));
  return true;
end;
$$;

-- Privileges ------------------------------------------------------------------------------------------------

revoke all on private.staff_members, private.moderation_cases, private.content_hides, private.account_pauses,
  private.appeals, private.reputation_corrections, private.trust_audit from public, anon, authenticated;

revoke all on function authz.staff_role(uuid), authz.is_staff(uuid), authz.is_paused(uuid) from public, anon;
grant execute on function authz.staff_role(uuid), authz.is_staff(uuid), authz.is_paused(uuid)
  to authenticated, service_role;
revoke all on function private.active_pause(uuid), private.require_uid_any(), private.require_staff(boolean),
  private.trust_reason(text), private.audit(uuid, text, text, uuid, uuid, uuid, uuid, text, jsonb),
  private.grant_staff(uuid, text, text), private.revoke_staff(uuid, text), private.trust_append_only()
  from public, anon, authenticated;
