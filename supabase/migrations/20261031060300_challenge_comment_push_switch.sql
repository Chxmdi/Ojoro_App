-- Polish (GAPS-FEED, owner decision): one switch in Settings → Notifications, "Replies and mentions",
-- covers both challenge_reply and challenge_mention. Setting either type sets both, so push_off and
-- private.would_send treat them as one. Starts from 20261029150200_messaging_notifications.sql (the
-- only earlier definition). Contract: docs/COMPETITION_CONTRACT.md ("Notifications").
create or replace function public.set_notification_type(p_type public.notification_type, p_push boolean)
returns public.notification_prefs_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if p_type is null or p_push is null then
    perform private.fail('invalid_argument', 'type and push');
  end if;
  insert into public.notification_settings (user_id, type, push)
  select v_uid, t, p_push
  from unnest(case when p_type in ('challenge_reply', 'challenge_mention')
                   then array['challenge_reply', 'challenge_mention']::public.notification_type[]
                   else array[p_type] end) t
  on conflict (user_id, type) do update set push = excluded.push, updated_at = now();
  return private.prefs_of(v_uid);
end;
$$;
