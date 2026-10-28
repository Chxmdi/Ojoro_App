-- Foundation (step 0). No product tables here: the Slice 01 data model lands in later migrations.
--
-- What this sets up:
--   1. Extensions the server-side rules will lean on, installed into the `extensions` schema.
--   2. A `private` schema for helpers, triggers and SECURITY DEFINER internals. It is not in
--      [api].schemas (supabase/config.toml), so the Data API never exposes it, and the client
--      roles get no access to it at all.
--   3. `private.set_updated_at()`, the shared trigger that keeps `updated_at` honest.
--
-- See docs/adr/0001-backend-supabase.md for what runs where.

-- 1. Extensions -----------------------------------------------------------------------------------

-- gen_random_bytes / digest for idempotency keys and opaque tokens. Supabase ships it already;
-- `if not exists` keeps this safe to run on any project.
create extension if not exists pgcrypto with schema extensions;

-- 2. Private schema -------------------------------------------------------------------------------

create schema if not exists private;

comment on schema private is
  'Ojoro internals: helpers, triggers and privileged functions. Never exposed through the Data API.';

revoke all on schema private from public;
revoke all on schema private from anon, authenticated;
grant usage on schema private to service_role;

-- Postgres grants EXECUTE on new functions to PUBLIC by default, and a per-schema
-- `alter default privileges` cannot take that global default away. What keeps `private` closed is
-- the missing USAGE above: anon and authenticated cannot resolve anything in this schema. Each
-- function here still revokes its own EXECUTE, as defense in depth, like the one below.

-- 3. updated_at trigger helper --------------------------------------------------------------------
--
-- Usage in a later migration:
--   create trigger set_updated_at
--     before update on public.some_table
--     for each row execute function private.set_updated_at();

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

comment on function private.set_updated_at() is
  'BEFORE UPDATE trigger: stamps updated_at with the transaction time.';

revoke all on function private.set_updated_at() from public, anon, authenticated;
