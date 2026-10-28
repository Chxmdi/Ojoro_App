# ADR 0001: Supabase is the backend

- Status: accepted
- Date: 2026-10-28
- Decided by: Blessed (owner)
- Scope: HANDOFF step 0 (PRD M0). The Slice 01 data model is a later decision.

## Context

The PRD doesn't name a backend; `design-handoff/HANDOFF.md` lists it as an open decision. What
Ojoro needs from one (PRD §11, §14, §17):

- Phone-number sign-in.
- Relational data: Users, Plans, Activities, Attendance, Crews, Challenges and their links (§14).
- Server-side authorization for visibility, participants, payments and moderation (§17 Security).
- Join, leave, capacity and check-in mutations that are idempotent and safe to retry (§17 Reliability).
- Plan and member state that reaches other people within seconds (§17 Realtime).
- File storage for recap media; push notifications.
- Privacy by default: areas, not addresses; live location for one game only (§11.2).

## Decision

Use **Supabase**: Postgres with row-level security, Supabase Auth (phone OTP), Realtime, Storage
and Edge Functions. Push goes through **Expo push notifications**. `apps/api` stays for work that
doesn't fit Supabase (payment-provider webhooks, once a provider is chosen).

The project lives in `supabase/` at the repo root: `config.toml` for the local stack, `migrations/`
for schema changes (Supabase CLI naming, `YYYYMMDDHHMMSS_name.sql`), `seed.sql` for local sample data.

## What runs where

| Concern | Where it runs | Rule |
|---|---|---|
| Sign-in | Supabase Auth, phone OTP | Email signups off. SMS provider not chosen yet; local dev uses the test OTP numbers in `config.toml`. |
| Reading data (visibility) | Postgres RLS policies | RLS on for every table in an exposed schema. Policies check the caller's relationship to the row (`auth.uid()` plus membership), never `user_metadata`. Views use `security_invoker`. |
| Changing data (mutations) | Postgres functions called with `supabase.rpc()` | Joins, leaves, capacity, check-in and Plan → GAME ON go through functions, not direct table writes. Each takes a client-generated idempotency key, so a retry returns the first result instead of acting twice. Capacity is checked and taken in the same transaction (row lock or a constrained count). Promoting a Plan to GAME ON creates exactly one Activity; accepting a Challenge creates exactly one Challenge Event. |
| Privileged helpers | `private` schema | Not exposed by the Data API; client roles get no `USAGE`. `SECURITY DEFINER` only here, with a pinned `search_path` and an explicit `auth.uid()` check. |
| Live plan counts | Realtime channels | Clients subscribe per plan. What they receive is still filtered by RLS (Postgres Changes) or sent by server code (Broadcast); they never see rows they couldn't read. |
| Recap media | Supabase Storage | Private buckets, policies tied to the activity's participants. |
| Push | Expo push service, sent from an Edge Function or a database-triggered job | Real notifications are only sent with the owner's OK (CLAUDE.md "Ask first"). |
| Payment webhooks, other third-party callbacks | `apps/api` (or an Edge Function if it fits) | Uses the service-role key server-side only. |

Keys: the mobile app gets only `EXPO_PUBLIC_SUPABASE_URL` and the **publishable** key
(`sb_publishable_...`; the legacy anon JWT also works). The service-role or `sb_secret_...` key is
server-only (`SUPABASE_SERVICE_ROLE_KEY` in the root `.env.example`). `apps/mobile/src/lib/env.ts`
refuses to start with a secret key, and `scripts/ci/validate-env-contract.mjs` keeps non-public
keys out of the mobile env file.

## Consequences

- Business rules live in SQL. They need database-level tests (pgTAP via `supabase test db`) next to
  the migrations, in addition to app tests.
- Authorization is enforced by the database for every client, so a bug in the app can't widen
  access. In exchange, every new table needs RLS and policies written and reviewed in the same
  migration that creates it.
- Supabase Realtime and Auth are the parts we'd have to replace if we ever leave; the data itself is
  plain Postgres and portable.
- Local development needs Docker for `supabase start`.
- Phone OTP costs money per SMS once a provider is set up. Rate limits in `config.toml` (`[auth.rate_limit]`)
  and the hosted project need to be set before launch.

## Rules for changes

- **Migrations on shared environments (any hosted Supabase project or branch) need the owner's OK**
  before they are applied. Locally, `supabase db reset` is fine.
- New migrations are created with `supabase migration new <name>`, never hand-named.
  `scripts/ci/validate-migrations.mjs` checks names, timestamps and basic SQL sanity in CI.
- No product tables in the foundation migration; Slice 01 adds them.
