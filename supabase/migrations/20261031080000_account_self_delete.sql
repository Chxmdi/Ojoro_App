-- Polish (ACCOUNT): self-serve account deletion (App Store 5.1.1(v), Google Play account deletion).
-- Contract: docs/TRUST_CONTRACT.md ("Account deletion" → "Deleting your own account").
--
-- The database side already exists (20261031040700 / 040900 / 041000): deleting the Auth user cascades and
-- keeps shared history under the "Former member" placeholder. This adds the checks a person's own deletion
-- needs, and the one service-role path the `account-delete` Edge Function calls:
--
--   * private.account_deletion_blockers(uid): what stops it, in the order to fix it:
--       staff            a staff account (an admin removes the staff role first);
--       dispute_open     a program they own has an open dispute;
--       refund_pending   a program they own has a Stripe refund still going back to a buyer;
--       payout_pending   a program they own, with a Stripe account, has money not yet paid out to them
--                        (this week's Stripe charges, a closed week still scheduled or failed, or a Stripe
--                        payout pending or in transit).
--     Programs without Stripe hold no money in Ojoro: their scheduled weeks are records only and don't block.
--   * public.account_deletion_check(): the signed-in person's own blockers (works while paused).
--   * public.account_deletion_preflight(uid) / public.account_delete(uid, source): service role only. The
--     function re-checks the caller's JWT with Auth, reads the preflight (blockers + their own photo files to
--     remove from Storage), removes the files, then deletes. account_delete locks the Auth user, checks the
--     blockers again in the same transaction, writes one trust_audit row with no personal data (no user id,
--     no name, no phone: the source and counts), and deletes the Auth user. Already gone → 'already_deleted'
--     (idempotent: a retry after a dropped answer succeeds).

-- What stops a deletion ---------------------------------------------------------------------------------------

create or replace function private.account_deletion_blockers(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with owned as (
    select hp.id, hp.name,
           exists (select 1 from public.host_payment_accounts a where a.program_id = hp.id) as on_stripe
    from public.host_programs hp
    join public.host_program_hosts h on h.program_id = hp.id and h.user_id = p_uid and h.role = 'owner'
  ),
  b as (
    select 0 as ord, 'staff' as kind, null::uuid as program_id, null::text as program_name
    where authz.is_staff(p_uid)
    union all
    select 1, 'dispute_open', o.id, o.name from owned o
    where exists (select 1 from public.host_disputes d where d.program_id = o.id and d.status = 'open')
    union all
    select 2, 'refund_pending', o.id, o.name from owned o
    where exists (select 1 from public.host_refunds r
                  where r.program_id = o.id and r.status = 'pending' and r.provider = 'stripe')
    union all
    select 3, 'payout_pending', o.id, o.name from owned o
    where o.on_stripe and (
      exists (select 1 from public.host_provider_payouts pp
              where pp.program_id = o.id and pp.status in ('pending', 'in_transit'))
      or exists (select 1 from public.host_payouts po
                 where po.program_id = o.id and po.status in ('scheduled', 'failed') and po.net_cents > 0)
      or exists (select 1 from public.host_charges c
                 where c.program_id = o.id and c.provider = 'stripe' and c.status = 'paid'
                   and c.paid_at >= coalesce((select max(po.period_end) from public.host_payouts po
                                              where po.program_id = o.id), '-infinity'::timestamptz))
    )
  )
  select coalesce(jsonb_agg(jsonb_build_object('kind', b.kind, 'program_id', b.program_id,
                                               'program_name', b.program_name)
                            order by b.ord, b.program_name), '[]'::jsonb)
  from b;
$$;

-- The signed-in person's own check (the app shows it before asking for DELETE). Works while paused.
create or replace function public.account_deletion_check()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid_any();
  v_blockers jsonb := private.account_deletion_blockers(v_uid);
begin
  return jsonb_build_object('can_delete', jsonb_array_length(v_blockers) = 0, 'blockers', v_blockers);
end;
$$;

-- Service role: what the function needs before deleting.
create or replace function public.account_deletion_preflight(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_blockers jsonb;
  v_paths jsonb;
begin
  if p_user_id is null or p_user_id = private.former_member() then
    perform private.fail('invalid_argument', 'user_id');
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    return jsonb_build_object('status', 'already_deleted', 'blockers', '[]'::jsonb, 'storage_paths', '[]'::jsonb);
  end if;
  v_blockers := private.account_deletion_blockers(p_user_id);
  -- Their own photo files (moments: <activity_id>/<uploader>/<file>). Their moment rows cascade.
  select coalesce(jsonb_agg(o.name order by o.name), '[]'::jsonb) into v_paths
    from storage.objects o
   where o.bucket_id = 'moments'
     and (o.owner_id = p_user_id::text or split_part(o.name, '/', 2) = p_user_id::text);
  return jsonb_build_object('status', case when jsonb_array_length(v_blockers) = 0 then 'ready' else 'blocked' end,
                            'blockers', v_blockers, 'storage_paths', v_paths);
end;
$$;

-- Service role: delete. Returns { status: 'deleted' | 'already_deleted' | 'blocked', blockers }.
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
  if jsonb_array_length(v_blockers) > 0 then
    return jsonb_build_object('status', 'blocked', 'blockers', v_blockers);
  end if;
  select count(*) into v_programs from public.host_program_hosts h where h.user_id = p_user_id and h.role = 'owner';
  -- No personal data: no user id, name or phone. Only how it was asked for and what it touched.
  insert into private.trust_audit (actor_id, action, subject_kind, reason, detail)
  values (null, 'account_self_deleted', 'account', null,
          jsonb_build_object('source', v_source, 'owned_programs', v_programs));
  perform private.emit('account_deleted', null, jsonb_build_object('source', v_source));
  delete from auth.users where id = p_user_id;
  return jsonb_build_object('status', 'deleted', 'blockers', '[]'::jsonb);
end;
$$;

revoke all on function private.account_deletion_blockers(uuid) from public, anon, authenticated;
revoke all on function public.account_deletion_check() from public, anon;
grant execute on function public.account_deletion_check() to authenticated;
revoke all on function public.account_deletion_preflight(uuid) from public, anon, authenticated;
revoke all on function public.account_delete(uuid, text) from public, anon, authenticated;
grant execute on function public.account_deletion_preflight(uuid) to service_role;
grant execute on function public.account_delete(uuid, text) to service_role;
