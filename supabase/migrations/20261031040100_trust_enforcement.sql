-- Step 8 (Trust): what reports open, what staff see, and what a pause or a hide does everywhere.
-- Contract: docs/TRUST_CONTRACT.md.
--
--   * private.subject_owner / private.subject_view: who is responsible for a reported thing, and the thing
--     shown safely (text as text, photos as storage paths, places by name and area, never a location).
--   * Reports join one case per subject (trigger), with severity; report() de-duplicates per reporter.
--     report() starts from its latest definition (20261030100010_communities_report.sql) and keeps the
--     private.report_subject_visible seam.
--   * Paused accounts can't write their profile or settings or upload (restrictive RLS); hidden moments'
--     photos are unreadable except by staff.
--   * New rate limits as triggers on the table (host join requests, host announcements).

-- Subjects ---------------------------------------------------------------------------------------------------

create or replace function private.subject_owner(p_kind public.report_subject, p_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v uuid;
begin
  case p_kind::text
    when 'profile' then select id into v from public.profiles where id = p_id;
    when 'plan' then select host_id into v from public.plans where id = p_id;
    when 'activity' then select host_id into v from public.activities where id = p_id;
    when 'moment' then
      select author_id into v from public.moments where id = p_id;
      if v is null then
        select h.owner_id into v from private.content_hides h
        where h.subject_kind = 'moment' and h.subject_id = p_id order by h.hidden_at desc limit 1;
      end if;
    when 'result' then select proposed_by into v from public.result_proposals where id = p_id;
    when 'message' then select sender_id into v from public.messages where id = p_id;
    when 'update' then select author_id into v from public.activity_updates where id = p_id;
    when 'call_out' then select challenger_id into v from public.call_outs where id = p_id;
    when 'challenge_event' then select a_user_id into v from public.challenge_events where id = p_id;
    when 'challenge_post' then select author_id into v from public.challenge_posts where id = p_id;
    when 'challenge_comment' then select author_id into v from public.challenge_comments where id = p_id;
    when 'crew' then select created_by into v from public.crews where id = p_id;
    when 'clan' then select created_by into v from public.clans where id = p_id;
    when 'clan_run' then select coalesce(host_id, created_by) into v from public.clan_runs where id = p_id;
    when 'clash' then select proposed_by into v from public.clashes where id = p_id;
    when 'host_program' then select created_by into v from public.host_programs where id = p_id;
    else v := null;
  end case;
  return v;
end;
$$;

create or replace function private.person_brief(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_uid is null then null else (
    select jsonb_build_object('id', p.id, 'display_name', p.display_name, 'handle', p.handle)
    from public.profiles p where p.id = p_uid) end;
$$;

create or replace function private.place_brief(p_place uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pl.name || coalesce(' · ' || pl.area, '') from public.places pl where pl.id = p_place;
$$;

-- The reported thing, shown safely to staff (StaffSubject in docs/TRUST_CONTRACT.md). Hidden text and
-- moments come from the kept original.
create or replace function private.subject_view(p_kind public.report_subject, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hide private.content_hides%rowtype;
  v jsonb;
  v_exists boolean := false;
  v_title text;
  v_text text;
  v_media jsonb := '[]'::jsonb;
  v_author uuid;
  v_context jsonb := '{}'::jsonb;
  v_created timestamptz;
  v_deleted boolean := false;
  r record;
begin
  select * into v_hide from private.content_hides h
  where h.subject_kind = p_kind and h.subject_id = p_id and h.restored_at is null;

  case p_kind::text
    when 'profile' then
      select * into r from public.profiles where id = p_id;
      if found then
        v_exists := true; v_author := r.id; v_created := r.created_at;
        v_title := 'Profile: ' || coalesce(r.display_name, r.handle, 'no name');
        v_text := concat_ws(' · ', r.display_name, '@' || r.handle, r.area);
        if r.avatar_path is not null then
          v_media := jsonb_build_array(jsonb_build_object('bucket', 'avatars', 'path', r.avatar_path, 'alt_text', null));
        end if;
      end if;
    when 'plan' then
      select p.*, s.name as sport_name into r from public.plans p join public.sports s on s.id = p.sport_id where p.id = p_id;
      if found then
        v_exists := true; v_author := r.host_id; v_created := r.created_at;
        v_title := 'Plan: ' || r.sport_name || coalesce(' at ' || private.place_brief(r.place_id), '');
        v_text := r.title;
        v_context := jsonb_build_object('plan_id', r.id, 'starts_at', r.starts_at, 'status', r.status, 'crew_id', r.crew_id);
      end if;
    when 'activity' then
      select a.*, s.name as sport_name into r from public.activities a join public.sports s on s.id = a.sport_id where a.id = p_id;
      if found then
        v_exists := true; v_author := r.host_id; v_created := r.created_at;
        v_title := 'Game: ' || r.sport_name || coalesce(' at ' || private.place_brief(r.place_id), '');
        v_text := r.title;
        v_context := jsonb_build_object('activity_id', r.id, 'plan_id', r.plan_id, 'starts_at', r.starts_at, 'status', r.status);
      end if;
    when 'moment' then
      select * into r from public.moments where id = p_id;
      if found then
        v_exists := true; v_author := r.author_id; v_created := r.created_at;
        v_text := r.caption;
        v_media := jsonb_build_array(jsonb_build_object('bucket', 'moments', 'path', r.storage_path, 'alt_text', r.alt_text));
        v_context := jsonb_build_object('activity_id', r.activity_id);
      elsif v_hide.id is not null then
        v_exists := true; v_author := v_hide.owner_id; v_created := (v_hide.original -> 'row' ->> 'created_at')::timestamptz;
        v_text := v_hide.original -> 'row' ->> 'caption';
        v_media := jsonb_build_array(jsonb_build_object('bucket', 'moments', 'path', v_hide.original -> 'row' ->> 'storage_path',
                                                        'alt_text', v_hide.original -> 'row' ->> 'alt_text'));
        v_context := jsonb_build_object('activity_id', v_hide.original -> 'row' ->> 'activity_id');
      end if;
      if v_exists then v_title := 'Photo from a game'; end if;
    when 'result' then
      select * into r from public.result_proposals where id = p_id;
      if found then
        v_exists := true; v_author := r.proposed_by; v_created := r.created_at;
        v_title := 'Result ' || r.team_a_score || '–' || r.team_b_score;
        v_context := jsonb_build_object('activity_id', r.activity_id, 'status', r.status);
      end if;
    when 'message' then
      select m.*, c.name as crew_name into r from public.messages m left join public.crews c on c.id = m.crew_id where m.id = p_id;
      if found then
        v_exists := true; v_author := r.sender_id; v_created := r.created_at;
        v_title := case when r.crew_id is not null then 'Message in ' || r.crew_name else 'Message in a game chat' end;
        v_text := coalesce(r.body, v_hide.original ->> 'body');
        v_deleted := r.deleted_at is not null and v_hide.id is null;
        v_context := jsonb_build_object('crew_id', r.crew_id, 'activity_id', r.activity_id);
      end if;
    when 'update' then
      select * into r from public.activity_updates where id = p_id;
      if found then
        v_exists := true; v_author := r.author_id; v_created := r.created_at;
        v_title := 'Game update';
        v_text := coalesce(r.body, v_hide.original ->> 'body');
        v_deleted := r.deleted_at is not null and v_hide.id is null;
        v_context := jsonb_build_object('activity_id', r.activity_id);
      end if;
    when 'call_out' then
      select * into r from public.call_outs where id = p_id;
      if found then
        v_exists := true; v_author := r.challenger_id; v_created := r.created_at;
        v_title := 'Call-Out: ' || r.title; v_text := r.message;
        v_context := jsonb_build_object('event_id', r.event_id, 'opponent', private.person_brief(r.opponent_id), 'status', r.status);
      end if;
    when 'challenge_event' then
      select * into r from public.challenge_events where id = p_id;
      if found then
        v_exists := true; v_author := r.a_user_id; v_created := r.accepted_at;
        v_title := 'Challenge: ' || r.title;
        v_context := jsonb_build_object('event_id', r.id, 'opponent', private.person_brief(r.b_user_id), 'status', r.status);
      end if;
    when 'challenge_post' then
      select * into r from public.challenge_posts where id = p_id;
      if found then
        v_exists := true; v_author := r.author_id; v_created := r.created_at;
        v_title := 'Challenge build-up post';
        v_text := coalesce(r.body, v_hide.original ->> 'body');
        v_deleted := r.deleted_at is not null and v_hide.id is null;
        v_context := jsonb_build_object('event_id', r.event_id);
      end if;
    when 'challenge_comment' then
      select * into r from public.challenge_comments where id = p_id;
      if found then
        v_exists := true; v_author := r.author_id; v_created := r.created_at;
        v_title := 'Challenge comment';
        v_text := coalesce(r.body, v_hide.original ->> 'body');
        v_deleted := r.deleted_at is not null and v_hide.id is null;
        v_context := jsonb_build_object('event_id', r.event_id);
      end if;
    when 'rivalry' then
      select * into r from public.rivalries where id = p_id;
      if found then
        v_exists := true; v_created := r.created_at; v_title := 'Rivalry';
        v_context := jsonb_build_object('a', private.person_brief(r.low_id), 'b', private.person_brief(r.high_id));
      end if;
    when 'crew' then
      select * into r from public.crews where id = p_id;
      if found then
        v_exists := true; v_author := r.created_by; v_created := r.created_at;
        v_title := 'Crew: ' || r.name; v_text := r.name;
        v_context := jsonb_build_object('crew_id', r.id, 'member_count', r.member_count);
      end if;
    when 'clan' then
      select * into r from public.clans where id = p_id;
      if found then
        v_exists := true; v_author := r.created_by; v_created := r.created_at;
        v_title := 'Clan: ' || r.name; v_text := concat_ws(' · ', r.name, r.tagline);
        v_context := jsonb_build_object('clan_id', r.id, 'member_count', r.member_count);
      end if;
    when 'clan_run' then
      select * into r from public.clan_runs where id = p_id;
      if found then
        v_exists := true; v_author := coalesce(r.host_id, r.created_by); v_created := r.created_at;
        v_title := 'Club run: ' || coalesce(r.title, r.sport_id); v_text := r.title;
        v_context := jsonb_build_object('clan_id', r.clan_id, 'starts_at', r.starts_at);
      end if;
    when 'clash' then
      select * into r from public.clashes where id = p_id;
      if found then
        v_exists := true; v_author := r.proposed_by; v_created := r.created_at;
        v_title := 'Clash: ' || r.title; v_text := r.title;
        v_context := jsonb_build_object('a_clan_id', r.a_clan_id, 'b_clan_id', r.b_clan_id, 'status', r.status);
      end if;
    when 'host_program' then
      select * into r from public.host_programs where id = p_id;
      if found then
        v_exists := true; v_author := r.created_by; v_created := r.created_at;
        v_title := 'Program: ' || r.name; v_text := concat_ws(' · ', r.name, r.area);
        v_context := jsonb_build_object('program_id', r.id);
      end if;
    when 'place' then
      select * into r from public.places where id = p_id;
      if found then
        v_exists := true; v_created := r.created_at;
        v_title := 'Place: ' || r.name; v_text := concat_ws(' · ', r.name, r.area, r.city);
        v_context := jsonb_build_object('place_id', r.id, 'sensitive', r.sensitive);
      end if;
    else
      null;
  end case;

  return jsonb_build_object(
    'kind', p_kind, 'id', p_id, 'exists', v_exists, 'title', v_title,
    'text', v_text, 'media', v_media, 'author', private.person_brief(v_author),
    'context', v_context || jsonb_build_object('label', v_title), 'created_at', v_created,
    'deleted', v_deleted, 'hidden', v_hide.id is not null
  );
end;
$$;

-- Cases ---------------------------------------------------------------------------------------------------------

create or replace function private.reason_rank(p_reason public.report_reason)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select case p_reason
    when 'unsafe' then 3
    when 'harassment' then 2 when 'impersonation' then 2 when 'inappropriate' then 2
    else 1 end::smallint;
$$;

create or replace function private.severity_label(p_rank smallint)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_rank when 3 then 'high' when 2 then 'medium' else 'low' end;
$$;

-- Each new report joins the open case for its subject, or opens one (with a snapshot of the content).
create or replace function private.report_to_case()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case private.moderation_cases%rowtype;
begin
  -- A report written as already decided (imports, fixtures) stays out of the queue.
  if new.status not in ('open', 'reviewing') then
    return new;
  end if;
  select * into v_case from private.moderation_cases c
  where c.subject_kind = new.subject_kind and c.subject_id = new.subject_id and c.status in ('open', 'reviewing')
  for update;
  if not found then
    insert into private.moderation_cases (subject_kind, subject_id, owner_id, snapshot, opened_at, last_reported_at)
    values (new.subject_kind, new.subject_id, private.subject_owner(new.subject_kind, new.subject_id),
            private.subject_view(new.subject_kind, new.subject_id), new.created_at, new.created_at)
    on conflict (subject_kind, subject_id) where status in ('open', 'reviewing') do nothing
    returning * into v_case;
    if v_case.id is null then
      select * into v_case from private.moderation_cases c
      where c.subject_kind = new.subject_kind and c.subject_id = new.subject_id and c.status in ('open', 'reviewing')
      for update;
    end if;
  end if;
  new.case_id := v_case.id;
  new.status := v_case.status;
  return new;
end;
$$;

create or replace function private.case_after_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case private.moderation_cases%rowtype;
  v_reporters integer;
  v_rank integer;
  v_view jsonb;
begin
  select * into v_case from private.moderation_cases where id = new.case_id;
  if not found then
    return null;
  end if;
  select count(distinct r.reporter_id), max(private.reason_rank(r.reason))
    into v_reporters, v_rank
  from public.reports r where r.case_id = v_case.id;
  if v_reporters >= 5 then
    v_rank := 3;
  elsif v_reporters >= 3 then
    v_rank := v_rank + 1;
  end if;
  if v_case.owner_id is not null and exists (
       select 1 from private.moderation_cases c
       where c.owner_id = v_case.owner_id and c.id <> v_case.id and c.status = 'actioned'
         and c.resolved_at > now() - interval '90 days') then
    v_rank := v_rank + 1;
  end if;
  v_view := private.subject_view(v_case.subject_kind, v_case.subject_id);
  update private.moderation_cases c
     set report_count = (select count(*) from public.reports r where r.case_id = c.id),
         reporter_count = v_reporters,
         reasons = (select array_agg(x.reason order by x.n desc, x.reason)
                    from (select r.reason, count(*) as n from public.reports r where r.case_id = c.id group by r.reason) x),
         severity_rank = greatest(c.severity_rank, least(v_rank, 3))::smallint,
         last_reported_at = greatest(c.last_reported_at, new.created_at),
         snapshot = case when (v_view ->> 'exists')::boolean and not (v_view ->> 'hidden')::boolean
                         then v_view else c.snapshot end
   where c.id = v_case.id;
  return null;
end;
$$;

drop trigger if exists reports_to_case on public.reports;
create trigger reports_to_case before insert on public.reports
  for each row execute function private.report_to_case();
drop trigger if exists reports_case_after on public.reports;
create trigger reports_case_after after insert on public.reports
  for each row execute function private.case_after_report();

-- Reports made before Step 8 join cases too (oldest first, so severity builds up the same way).
do $$
declare
  r record;
  v_case uuid;
begin
  for r in select * from public.reports where case_id is null order by created_at, id loop
    select id into v_case from private.moderation_cases c
    where c.subject_kind = r.subject_kind and c.subject_id = r.subject_id and c.status in ('open', 'reviewing');
    if v_case is null then
      insert into private.moderation_cases (subject_kind, subject_id, owner_id, snapshot, opened_at, last_reported_at)
      values (r.subject_kind, r.subject_id, private.subject_owner(r.subject_kind, r.subject_id),
              private.subject_view(r.subject_kind, r.subject_id), r.created_at, r.created_at)
      returning id into v_case;
    end if;
    update public.reports set case_id = v_case where id = r.id;
    update private.moderation_cases c
       set report_count = x.n, reporter_count = x.people, last_reported_at = x.last_at,
           reasons = x.reasons,
           severity_rank = least(3, x.rank + case when x.people >= 5 then 3 when x.people >= 3 then 1 else 0 end)::smallint
      from (select count(*) as n, count(distinct rr.reporter_id) as people, max(rr.created_at) as last_at,
                   max(private.reason_rank(rr.reason)) as rank, array_agg(distinct rr.reason) as reasons
            from public.reports rr where rr.case_id = v_case) x
     where c.id = v_case;
    v_case := null;
  end loop;
end;
$$;

-- report(): same rules, plus one open report per reporter and subject ----------------------------------------

create or replace function public.report(
  p_subject_kind public.report_subject,
  p_subject_id uuid,
  p_reason public.report_reason,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_id uuid;
  v_exists boolean;
  v_note text := nullif(trim(p_note), '');
begin
  if char_length(p_note) > 1000 then
    perform private.fail('invalid_argument', 'note');
  end if;
  if (select count(*) from public.reports r
      where r.reporter_id = v_uid and r.created_at > now() - interval '24 hours') >= 20 then
    perform private.fail('report_rate_limited', '20');
  end if;
  v_exists := case p_subject_kind
    when 'profile' then exists (select 1 from public.profiles where id = p_subject_id)
    when 'plan' then exists (select 1 from public.plans where id = p_subject_id)
    when 'activity' then exists (select 1 from public.activities where id = p_subject_id)
    when 'moment' then exists (select 1 from public.moments where id = p_subject_id)
    when 'result' then exists (select 1 from public.result_proposals where id = p_subject_id)
    -- Only a message you can read (or wrote) can be reported.
    when 'message' then exists (select 1 from public.messages m where m.id = p_subject_id
                                  and (m.sender_id = v_uid or authz.can_read_thread(m.crew_id, m.activity_id, v_uid)))
    when 'update' then exists (select 1 from public.activity_updates u where u.id = p_subject_id
                                 and authz.can_see_activity(u.activity_id, v_uid))
    -- Step 5: only what you can see.
    when 'call_out' then authz.can_see_call_out(p_subject_id, v_uid)
    when 'challenge_event' then authz.can_see_challenge_event(p_subject_id, v_uid)
    when 'challenge_post' then exists (select 1 from public.challenge_posts p where p.id = p_subject_id
                                         and p.author_id is not null
                                         and authz.can_see_challenge_event(p.event_id, v_uid))
    when 'challenge_comment' then exists (select 1 from public.challenge_comments c where c.id = p_subject_id
                                            and authz.can_see_challenge_event(c.event_id, v_uid))
    when 'rivalry' then exists (select 1 from public.challenge_events e
                                 where e.rivalry_id = p_subject_id and authz.can_see_challenge_event(e.id, v_uid))
    -- Step 6: communities.
    when 'crew' then authz.is_crew_member(p_subject_id, v_uid)
    when 'clan' then authz.can_see_clan(p_subject_id, v_uid)
    when 'clan_run' then exists (select 1 from public.clan_runs r where r.id = p_subject_id
                                   and authz.can_see_clan(r.clan_id, v_uid))
    when 'clash' then authz.can_see_clash(p_subject_id, v_uid)
    else private.report_subject_visible(p_subject_kind::text, p_subject_id, v_uid)
  end;
  if not coalesce(v_exists, false) then
    perform private.fail('subject_not_found');
  end if;
  -- Already reported by you and still open: the same report (a note fills an empty one).
  select r.id into v_id from public.reports r
  where r.reporter_id = v_uid and r.subject_kind = p_subject_kind and r.subject_id = p_subject_id
    and r.status in ('open', 'reviewing')
  order by r.created_at desc limit 1;
  if v_id is not null then
    update public.reports set note = coalesce(note, v_note) where id = v_id;
    perform private.emit('report_submitted', v_uid,
      jsonb_build_object('kind', p_subject_kind, 'reason', p_reason, 'deduplicated', true,
                         'case_id', (select case_id from public.reports where id = v_id)));
    return v_id;
  end if;
  insert into public.reports (reporter_id, subject_kind, subject_id, reason, note)
  values (v_uid, p_subject_kind, p_subject_id, p_reason, v_note)
  returning id into v_id;
  perform private.emit('report_submitted', v_uid,
    jsonb_build_object('kind', p_subject_kind, 'reason', p_reason, 'deduplicated', false,
                       'case_id', (select case_id from public.reports where id = v_id)));
  return v_id;
end;
$$;

-- Paused accounts: no direct writes either ---------------------------------------------------------------------

drop policy if exists "profiles: not while paused" on public.profiles;
create policy "profiles: not while paused" on public.profiles
  as restrictive for update to authenticated
  using (not authz.is_paused((select auth.uid())));
drop policy if exists "privacy_settings: not while paused" on public.privacy_settings;
create policy "privacy_settings: not while paused" on public.privacy_settings
  as restrictive for update to authenticated
  using (not authz.is_paused((select auth.uid())));
drop policy if exists "storage: no uploads while paused" on storage.objects;
create policy "storage: no uploads while paused" on storage.objects
  as restrictive for insert to authenticated
  with check (not authz.is_paused((select auth.uid())));

-- Hidden moments: the photo is unreadable except by staff; staff can read any moment photo.
create or replace function authz.moment_object_hidden(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.content_hides h
    where h.subject_kind = 'moment' and h.restored_at is null and h.original -> 'row' ->> 'storage_path' = p_name
  );
$$;
revoke all on function authz.moment_object_hidden(text) from public, anon;
grant execute on function authz.moment_object_hidden(text) to authenticated, service_role;

drop policy if exists "moments bucket: hidden by staff" on storage.objects;
create policy "moments bucket: hidden by staff" on storage.objects
  as restrictive for select to authenticated
  using (bucket_id <> 'moments' or authz.is_staff((select auth.uid())) or not authz.moment_object_hidden(name));
drop policy if exists "moments bucket: staff read" on storage.objects;
create policy "moments bucket: staff read" on storage.objects
  for select to authenticated
  using (bucket_id = 'moments' and authz.is_staff((select auth.uid())));

-- Rate limits on the table (every write path; seeds and the service role are not limited) ---------------------

create or replace function private.limit_join_requests()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if (select count(*) from public.host_join_requests r
      where r.user_id = new.user_id and r.created_at > now() - interval '24 hours') >= 20 then
    perform private.fail('join_request_rate_limited', '20');
  end if;
  return new;
end;
$$;
drop trigger if exists host_join_requests_rate on public.host_join_requests;
create trigger host_join_requests_rate before insert on public.host_join_requests
  for each row execute function private.limit_join_requests();

create or replace function private.limit_announcements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if (select count(*) from public.host_announcements a
      where a.author_id = new.author_id and a.created_at > now() - interval '1 hour') >= 10 then
    perform private.fail('announcement_rate_limited', '10');
  end if;
  return new;
end;
$$;
drop trigger if exists host_announcements_rate on public.host_announcements;
create trigger host_announcements_rate before insert on public.host_announcements
  for each row execute function private.limit_announcements();

-- Privileges ------------------------------------------------------------------------------------------------------

revoke all on function private.subject_owner(public.report_subject, uuid), private.person_brief(uuid),
  private.place_brief(uuid), private.subject_view(public.report_subject, uuid),
  private.reason_rank(public.report_reason), private.severity_label(smallint), private.report_to_case(),
  private.case_after_report(), private.limit_join_requests(), private.limit_announcements()
  from public, anon, authenticated;
revoke all on function public.report(public.report_subject, uuid, public.report_reason, text) from public, anon;
grant execute on function public.report(public.report_subject, uuid, public.report_reason, text)
  to authenticated, service_role;
