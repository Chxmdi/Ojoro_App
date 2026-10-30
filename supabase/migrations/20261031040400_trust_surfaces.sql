-- Step 8 (Trust): the one read that checks the blocks table directly instead of authz.is_blocked (chat
-- pages) also hides a paused account's messages. They come back as hidden placeholders (no sender, no
-- words), the same as messages from someone you blocked, so a restore brings them back as they were.
-- Starts from its only definition (20261029150100_messaging_crews_chat.sql). Contract: docs/TRUST_CONTRACT.md.

create or replace function private.thread_page(
  p_uid uuid, p_crew uuid, p_activity uuid, p_before uuid, p_limit integer
)
returns table (
  id uuid, sender_id uuid, sender_name text, sender_avatar_path text, kind public.message_kind,
  body text, reply_to uuid, payload jsonb, created_at timestamptz, edited_at timestamptz,
  is_deleted boolean, is_hidden boolean, is_mine boolean, mentions_me boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with cursor_row as (
    select c.created_at, c.id from public.messages c where c.id = p_before
  ),
  page as (
    select m.*,
           exists (select 1 from public.blocks b where b.blocker_id = p_uid and b.blocked_id = m.sender_id)
           or (m.sender_id <> p_uid and authz.is_paused(m.sender_id)) as hidden
    from public.messages m
    where (m.crew_id = p_crew or m.activity_id = p_activity)
      and not exists (select 1 from public.blocks b where b.blocker_id = m.sender_id and b.blocked_id = p_uid)
      and (p_before is null or (m.created_at, m.id) < (select cr.created_at, cr.id from cursor_row cr))
    order by m.created_at desc, m.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  )
  select p.id,
         case when p.hidden then null else p.sender_id end,
         case when p.hidden then null else pr.display_name end,
         case when p.hidden then null else pr.avatar_path end,
         p.kind,
         case when p.hidden then null else p.body end,
         p.reply_to,
         case when p.hidden then null else p.payload end,
         p.created_at,
         p.edited_at,
         p.deleted_at is not null,
         p.hidden,
         p.sender_id = p_uid,
         (not p.hidden and p_uid = any (p.mention_ids))
  from page p
  join public.profiles pr on pr.id = p.sender_id
  order by p.created_at desc, p.id desc;
$$;
revoke all on function private.thread_page(uuid, uuid, uuid, uuid, integer) from public, anon, authenticated;
