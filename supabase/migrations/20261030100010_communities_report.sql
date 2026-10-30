-- Step 6 (Communities): report reaches crews, clans, club runs and Clashes.
--
-- Same rules as before (20 reports a day, only what you can see, never across a block), plus:
--   crew      a crew you're in
--   clan      a clan you can see (authz.can_see_clan, 20261030100200_communities_clans.sql)
--   clan_run  a club run of a clan you can see
--   clash     a Clash you can see (authz.can_see_clash, 20261030100300_communities_clash.sql)
--
-- Other Step 6 kinds (hosts) plug in through private.report_subject_visible(kind, id, viewer): replace
-- that one function to add a kind instead of copying report() again. It returns null for kinds it
-- doesn't know, which reads as "not found".
-- plpgsql resolves names at run time, so this file can name the clan and Clash helpers that the next
-- migrations create.

create or replace function private.report_subject_visible(p_kind text, p_id uuid, p_viewer uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return null;
end;
$$;
revoke all on function private.report_subject_visible(text, uuid, uuid) from public, anon, authenticated;

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
begin
  if (select count(*) from public.reports r
      where r.reporter_id = v_uid and r.created_at > now() - interval '24 hours') >= 20 then
    perform private.fail('report_rate_limited');
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
  if char_length(p_note) > 1000 then
    perform private.fail('invalid_argument', 'note');
  end if;
  insert into public.reports (reporter_id, subject_kind, subject_id, reason, note)
  values (v_uid, p_subject_kind, p_subject_id, p_reason, nullif(trim(p_note), ''))
  returning id into v_id;
  return v_id;
end;
$$;
