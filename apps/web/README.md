# Ojoro staff admin (`@ojoro/web`)

The staff moderation tool: sign in (phone code, staff only), the moderation queue, case detail
(hide / restore content, pause / restore an account, take, resolve, dismiss), people (search by name or
handle, a person's record, pause / restore), appeals, the audit log and place sensitivity. React + Vite + TypeScript, styled with Ojoro's tokens (`@ojoro/design-tokens`).

It talks only to Supabase, with the publishable key and the signed-in staff member's own session.
Every read and write is a `staff_*` RPC from [`docs/TRUST_CONTRACT.md`](../../docs/TRUST_CONTRACT.md);
the server checks the staff grant on every call and writes the audit log. Never put a secret or
service-role key in this app: `src/lib/env.ts` refuses to start with one.

Judgment calls: `docs/DESIGN_DECISIONS.md`, "Step 8 ADMIN".

## Run it

```bash
cp apps/web/.env.example apps/web/.env   # then set the local values (see below)
pnpm --filter @ojoro/web dev             # http://localhost:5174
```

`.env` for the local stack: `VITE_SUPABASE_URL=http://127.0.0.1:54321` and
`VITE_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY from npx supabase status>`. The values are read at
runtime from the bundle; without them the app shows "Setup needed" (the CI build has none).

Local staff (seeded by `supabase/seed_trust.sql`, code `123456`): `+1 555 555 0190` (admin) and
`+1 555 555 0191` (moderator). Any other account is refused after the code. New test phone numbers in
`supabase/config.toml` need `npx supabase stop && npx supabase start` before the code works.

Staff are granted server-side only: `select private.grant_staff('<user uuid>', 'admin', 'reason');`
as postgres, or `staff_set_role` by an admin.

## Check it

```bash
pnpm --filter @ojoro/web typecheck
pnpm --filter @ojoro/web test            # vitest: pure logic in src/lib
pnpm --filter @ojoro/web build           # tsc + vite build → dist/
ADMIN_URL=http://localhost:5174 E2E_SHOTS=/tmp/admin-shots node apps/web/e2e/admin.e2e.mjs
```

The e2e (Playwright, Chromium) needs the local stack and the dev server. It refuses a non-staff
account through the phone-code UI, signs the staff admin in, makes its own case (two e2e people, a crew
message and a report), hides and undoes, pauses and undoes, resolves, upholds an appeal, checks the
audit log, searches people and pauses / restores from a person's screen, toggles a place's sensitivity
and back, and checks the loading, empty, error, not-found and
offline states.

## Layout

```text
src/main.tsx            entry: tokens + fonts into a <style>, then <App>
src/App.tsx             session gate (my_staff_role), header, hash routes
src/api.tsx             every staff RPC call
src/screens/            SignIn, Queue, ReportDetail, People (+ Person), Appeals, AuditLog, Places
src/ui/                 Icon, kit (Tag, Notice, Skeleton, Empty, Pager, Modal, Toast), ActionDialog, …
src/lib/                pure, tested: env, route, format, moderation, audit, errors, tokensCss
e2e/admin.e2e.mjs       Playwright end-to-end run
```
