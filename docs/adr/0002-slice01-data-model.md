# ADR 0002: Slice 01 data model and API shape

- Status: proposed (needs the owner's review before any hosted migration)
- Date: 2026-10-28
- Scope: Vertical Slice 01 backend (PRD §18.3). Contract: `docs/SLICE01_CONTRACT.md`.

## Context

ADR 0001 chose Supabase and set the rules: RLS for reads, Postgres functions with idempotency keys for
mutations, Realtime for plan counts, Storage for moments. Slice 01 needs those rules turned into
concrete shapes the mobile agents can build against without reading SQL.

## Decisions

1. **Writes only through RPCs.** Clients get SELECT on tables (rows filtered by RLS) and UPDATE on a
   few own-row columns (`profiles` name/handle/area/avatar, `privacy_settings`). Every other write is
   a `SECURITY DEFINER` function in `public` with `search_path = ''`, an `auth.uid()` check and the
   same visibility rules as RLS. Rationale: capacity, idempotency and GAME ON need row locks and
   multi-table transactions that policies can't express.
2. **`authz` schema for policy helpers.** RLS policies run as the caller, so their helper functions
   need to be executable by `authenticated`. They live in `authz` (USAGE for `authenticated`, not in
   `[api].schemas`, so not callable over the Data API). `private` stays closed to client roles and
   holds the mutation internals, the job and the idempotency/analytics tables.
3. **Stable error codes as the exception message** (SQLSTATE P0001), mirrored in
   `@ojoro/contracts` (`ojoroErrorCodes`, `toOjoroError`) with a CI test that fails if the SQL and the
   list drift apart.
4. **Idempotency table** `private.idempotency_keys (user_id, key, operation, result)`. The key is
   claimed with `insert … on conflict do nothing` before the work, so a concurrent retry waits and
   then returns the first result. The operation includes the target id, so a key can't be replayed
   against another plan.
5. **Typed returns.** Mutations return composite types (`plan_state`, `attendance_state`, …) and
   shaped reads `returns table`, so `supabase gen types` gives the app typed results. Read models
   that are plain joins are `security_invoker` views (`plan_cards`, `activity_cards`).
6. **Effective status computed from timestamps** in the views and in every mutation; a pg_cron job
   (`private.tick`, every minute) stores the status so Realtime subscribers get an UPDATE. Correctness
   doesn't depend on the job.
7. **Members-only data in separate tables** (`plan_meeting_points`, `location_shares`) instead of
   column privileges, because column grants can't vary per row.
8. **Coarse location only**: profile points are `numeric(5,2)` (about 1 km), copied to Down For rows
   for matching and never readable by anyone else. Check-in compares the position and discards it.
9. **Server-side analytics outbox** (`private.analytics_events`) for events whose truth is on the
   server (GAME ON, commits). The provider is not chosen (CLAUDE.md "Ask first").

## Consequences

- New tables need RLS and a policy in the same migration (a pgTAP test asserts RLS is on everywhere).
- Changing a function signature changes the generated types; run `pnpm db:types` and keep the
  `slice01Rpcs` list compiling.
- `authz.connected()` is the stand-in for Friends and Crews; replacing it changes visibility for
  `friends`/`crews` settings in one place.
- Tests: pgTAP under `supabase/tests/` (one transaction per file) plus a local-only concurrency script
  (`supabase/tests/race/im_down_race.sh`) for I'M DOWN races.
