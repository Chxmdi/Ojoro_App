-- Step 6 (Communities): the Ritual job, realtime and privileges.

-- Rituals prefill each week's plan or club run (private.ritual_tick, every 5 minutes) -------------------

revoke all on function private.ritual_tick() from public, anon, authenticated;
grant execute on function private.ritual_tick() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ojoro_ritual_tick', '*/5 * * * *', 'select private.ritual_tick()');
  else
    raise notice 'pg_cron not available: call private.ritual_tick() from a scheduler';
  end if;
end;
$$;

-- Realtime ---------------------------------------------------------------------------------------------------
-- postgres_changes respects RLS. Channels and filters: docs/COMMUNITIES_CONTRACT.md §Realtime.

alter publication supabase_realtime add table
  public.rituals,
  public.ritual_occurrences,
  public.clans,
  public.clan_members,
  public.clan_runs,
  public.clan_run_members,
  public.clan_missions,
  public.clan_join_requests,
  public.clashes,
  public.clash_events,
  public.clash_squad_members,
  public.clash_event_results,
  public.clash_result_submissions;

-- Privileges -------------------------------------------------------------------------------------------------

do $$
declare
  f record;
begin
  -- Private helpers: never callable by clients.
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.prokind = 'f'
      and p.proname in ('report_subject_visible', 'local_week_start', 'ritual_next_on', 'ritual_starts_at',
                        'crew_sessions', 'crew_weeks', 'crew_momentum', 'crew_free_tonight', 'can_edit_ritual',
                        'ensure_ritual_week', 'ritual_tick', 'validate_ritual', 'clan_max_members', 'add_to_clan',
                        'require_clan', 'require_clan_member', 'clan_run_stage', 'clan_run_state_of',
                        'mission_progress', 'drop_future_clan_runs', 'validate_clan_fields', 'clan_run_rows',
                        'clash_stage', 'clash_situation', 'clash_event_state', 'clash_state_of', 'require_clash',
                        'clash_squad_state_of', 'clash_winner', 'refuse_result_change')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
  -- The client API: signed-in people only.
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and p.proname in ('accept_clash', 'back_clash', 'cancel_clan_run', 'cancel_clash', 'check_in_clan_run',
                        'clan_clashes', 'clan_invite_code', 'clan_leaderboard', 'clan_mission', 'clan_requests',
                        'clan_roles', 'clan_roster', 'clan_run_view', 'clan_view', 'clan_week', 'clash_events_list',
                        'clash_my_part', 'clash_season_standings', 'clash_view', 'confirm_clash_result',
                        'create_clan', 'create_clan_run', 'create_clash', 'create_ritual', 'crew_down_for',
                        'crew_free_tonight', 'crew_home', 'crew_memories', 'crew_rituals', 'crew_rivalries',
                        'crew_versus', 'decide_clan_request', 'decline_clash', 'end_ritual', 'join_clan',
                        'join_clan_run', 'join_clan_with_code', 'join_clash_squad', 'join_down_for', 'leave_clan',
                        'leave_clan_run', 'leave_clash_squad', 'mark_clan_run_attendance', 'mark_crew_chat_read',
                        'my_clans', 'propose_clash_organizer', 'remove_clan_member', 'report',
                        'set_clan_leaderboard', 'set_clan_mission', 'set_clan_role', 'set_crew_rhythm',
                        'set_ritual_paused', 'skip_ritual_week', 'submit_clash_result', 'transfer_clan_captaincy',
                        'update_clan', 'update_ritual', 'withdraw_clan_request')
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end;
$$;

revoke all on all tables in schema private from public, anon, authenticated;
