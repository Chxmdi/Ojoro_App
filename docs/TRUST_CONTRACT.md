# Step 8: Trust and safety backend contract

Server-side trust and safety for the app and for the **staff admin web app** (`apps/web`). PRD §11.1
(safety model: block and report everywhere, moderation roles and audit trail, appeal and correction
paths), §11.3 (verification hierarchy), §9.17 (reputation signals need appeal/correction paths), §20
(server-side authorization and safety rules). It builds on every rule in
[`SLICE01_CONTRACT.md`](SLICE01_CONTRACT.md) (write only through RPCs, map errors by code, idempotency
keys) and closes the reputation appeal gap in [`PASSPORT_CONTRACT.md`](PASSPORT_CONTRACT.md#not-built).
Judgment calls: `docs/DESIGN_DECISIONS.md` ("Step 8 TRUST").

- Schema and RPCs: `supabase/migrations/20261031040000_trust_schema.sql` (staff, cases, hides, pauses,
  appeals, corrections, audit), `…040100_trust_enforcement.sql` (paused accounts, hidden content, report
  de-duplication, rate limits), `…040200_trust_staff.sql` (staff reads and writes),
  `…040300_trust_user.sql` (account status, appeals, reputation corrections on the reads).
- Client helpers: `packages/contracts/src/trust.ts` (exported from `@ojoro/contracts`): `trustRpcs`
  (app), `staffRpcs` (admin web), `trustIdempotentRpcs`, `trustErrorCodes` (also in `ojoroErrorCodes`),
  the jsonb shapes below as types, constants and word helpers.
- Tests: `supabase/tests/40_trust_moderation.sql` (staff, queue, cases, hides, pauses, audit),
  `41_trust_appeals_limits.sql` (appeals, reputation corrections, rate limits),
  `42_trust_block_surfaces.sql` (block and pause enforced on every person-to-person surface).
- Seed: `supabase/seed_trust.sql` (two staff accounts and a few open cases; see [Local data](#local-data)).

Contents: [Rules](#rules) · [Staff accounts](#staff-accounts) · [Errors](#errors) · [Reports and the
queue](#reports-and-the-queue) · [Staff reads](#staff-reads) · [Staff writes](#staff-writes) ·
[Paused accounts](#paused-accounts) · [Hidden content](#hidden-content) · [Appeals](#appeals) ·
[Reputation corrections](#reputation-corrections) · [Rate limits](#rate-limits) · [Block
enforcement](#block-enforcement) · [App surfaces](#app-surfaces) · [Analytics](#analytics) ·
[Local data](#local-data) · [Not built](#not-built)

---

## Rules

1. **Everything goes through RPCs.** All trust tables live in the `private` schema; no client role can
   read or write them. Staff use `staff_*` RPCs with their own signed-in session (anon key + their JWT,
   exactly like the app). Never the service role from a browser.
2. **Staff only, checked server-side.** Every `staff_*` RPC raises `not_staff` unless the caller has an
   active staff grant. `staff_set_role` also needs role `admin` (`not_admin`).
3. **Every staff write is audited**, in the same transaction, in `private.trust_audit`. **Every staff
   read that returns personal data is audited too** (`view_queue`, `view_case`, `view_user`,
   `view_appeals`, `view_appeal`, `view_audit`, `find_users`). The audit log is append-only: UPDATE,
   DELETE and TRUNCATE raise `audit_immutable` for every role (owner included).
4. **History is never rewritten.** Hiding content keeps the original (staff-only) and can be undone;
   pausing an account is a row with a start, an optional end and a restore; reputation corrections are
   new rows the reads apply (attendance and signals stay as they were); resolved cases stay resolved
   (a new report opens a new case).
5. **Staff writes are retry-safe.** Each takes `p_idempotency_key` (one uuid per staff intention,
   reused on retry; a retry returns the first result) and is also set-to-state (hiding something
   already hidden returns `changed: false`).
6. **Content is shown to staff safely:** text as text (never rendered as HTML), photos as storage paths
   the admin app shows blurred until a click (staff can read the `moments` bucket), people by name and
   handle with their coarse area. Never a precise location, phone number or address.
7. **Words:** no exclamation marks, counts not adjectives. Paused, not banned. User-facing strings come
   from the server only where noted (`note_to_user`), otherwise from `trust.ts` helpers.

## Staff accounts

- **Recognised by** an active row in `private.staff_members` (`user_id`, `role` = `moderator` |
  `admin`, `granted_by`, `granted_at`). `authz.is_staff(uid)` / `authz.staff_role(uid)` check it. There
  is no claim in the JWT: a revoke takes effect on the next call.
- **`my_staff_role() → text | null`**: any signed-in caller. `'moderator'`, `'admin'` or null. The admin
  app calls it after sign-in and shows "This account isn't staff." for null.
- **Granting / revoking server-side:**
  - SQL (service role or `psql` as postgres, e.g. the first admin of an environment):
    `select private.grant_staff('<user uuid>', 'admin', 'reason');` and
    `select private.revoke_staff('<user uuid>', 'reason');` (both audited with a null actor).
  - Admin RPC: `staff_set_role(p_user_id, p_role, p_reason, p_idempotency_key)` with `p_role` =
    `'moderator' | 'admin' | null` (null revokes). Can't change your own role (`invalid_argument`
    detail `self`); the last admin can't be removed (`staff_last_admin`).
- **Staff can't be paused** (`cannot_pause_staff`): revoke the role first. Staff keep a normal app
  account (they can report, block and be blocked like anyone).
- **Local staff** (seeded by `supabase/seed_trust.sql`, sign in with code `123456`):

| Who | Phone (`supabase/config.toml` test_otp) | id | Role |
|---|---|---|---|
| Ojoro Staff | `15555550190` | `a0000000-0000-4000-8000-000000000090` | `admin` |
| Ojoro Moderator | `15555550191` | `a0000000-0000-4000-8000-000000000091` | `moderator` |

Moderators and admins can do everything below except `staff_set_role` (admin only).

## Errors

New codes (SQLSTATE P0001, code in `error.message`, detail in `error.details`; words in
`apps/mobile/src/lib/errorMessages.ts`; the admin app has its own words):

| Code | When | detail |
|---|---|---|
| `account_paused` | The caller's account is paused: every RPC except the [exempt ones](#paused-accounts). | ends_at (ISO) or '' |
| `not_staff` | A `staff_*` RPC without an active staff grant. | |
| `not_admin` | `staff_set_role` by a moderator. | |
| `staff_last_admin` | Removing or demoting the last admin. | |
| `case_not_found` | No such case. | |
| `case_closed` | Resolving / assigning a case that is already actioned or dismissed. | |
| `cannot_hide_kind` | Hiding a kind that can't be hidden (see [Hidden content](#hidden-content)). | the kind |
| `hide_not_found` | Restoring content that isn't hidden. | |
| `cannot_pause_staff` | Pausing a staff account. | |
| `pause_end_invalid` | `p_ends_at` not in the future, or more than 365 days ahead. | |
| `reason_required` | A staff write without a reason (1–500 characters). | |
| `appeal_not_found` | No such appeal (or not yours). | |
| `appeal_closed` | Deciding an appeal that is already decided. | |
| `appeal_exists` | An open appeal on the same thing already exists (its id in detail). | appeal id |
| `appeal_not_allowed` | Nothing to appeal: not paused, not your hidden content, not a game counted as missed. | |
| `appeal_rate_limited` | More than 5 appeals in 7 days. | '5' |
| `join_request_rate_limited` | More than 20 host join requests in 24 hours. | '20' |
| `announcement_rate_limited` | More than 10 announcements by one host in an hour. | '10' |
| `audit_immutable` | Any UPDATE / DELETE on the audit log. | table |

Existing codes reused: `not_authenticated`, `invalid_argument` (detail = the field), `user_not_found`,
`subject_not_found`, `place_unknown`, `report_rate_limited`, `idempotency_key_required`,
`idempotency_key_reused`.

## Reports and the queue

`report(p_subject_kind, p_subject_id, p_reason, p_note)` keeps its signature and rules (only what you
can see, never across a block, 20 a day, kinds plug in through `private.report_subject_visible`). New:

- **De-duplicated per reporter:** reporting the same thing again while your earlier report on it is
  still open returns that report's id (no new row; a new note replaces an empty one).
- **One case per subject.** Every report joins the open case for its subject (`subject_kind`,
  `subject_id`), or opens one. A case is the queue item. When a case is resolved, a later report on the
  same subject opens a new case (the old one stays in the subject's history).
- **The reported content is snapshotted** when the case opens (and refreshed on each new report while
  the content still exists), so staff see what was reported even if the author deletes it.
- `public.reports.status` follows its case (`open` → `reviewing` → `actioned` | `dismissed`): the
  reporter can read their own reports (RLS) and see what happened.

**Severity** (`high` | `medium` | `low`, stored as rank 3/2/1, recomputed on every report):

| Starts at | Reasons |
|---|---|
| `high` | `unsafe` |
| `medium` | `harassment`, `impersonation`, `inappropriate` |
| `low` | `spam`, `other` |

It goes up one step at 3 distinct reporters, to `high` at 5, and one step when the subject's owner had
an actioned case in the last 90 days. It never goes down while the case is open.

**Case statuses:** `open` (nobody on it) → `reviewing` (assigned) → `actioned` | `dismissed`.

**Subject kinds** are the `report_subject` enum: `profile`, `plan`, `activity`, `moment`, `result`,
`message`, `update`, `call_out`, `challenge_event`, `challenge_post`, `challenge_comment`, `rivalry`,
`crew`, `clan`, `clan_run`, `clash`, `host_program`, `place` (and any later kind). **Owner** = the
person responsible: the profile itself, the author / sender / creator / host / challenger; null for
`place` and Ojoro's own posts.

## Staff reads

All are `volatile` (they write an audit row), `security definer`, staff only. Paged lists take
`p_limit` (default 50, max 100) and `p_cursor` (opaque string from the previous page's `next_cursor`;
null for the first page) and return `{ items: [...], next_cursor: string | null }`.

### `staff_queue(p_status text[] = {open,reviewing}, p_severity text[] = null, p_kinds text[] = null, p_assigned text = null, p_limit int = 50, p_cursor text = null) → jsonb`

Filters: `p_status` any of `open`, `reviewing`, `actioned`, `dismissed`; `p_severity` any of `high`,
`medium`, `low`; `p_kinds` subject kinds; `p_assigned` = `'me'` | `'unassigned'` | null (anyone).
Order: severity high first, then oldest `opened_at` first (open and reviewing); resolved cases
(when asked for) most recently resolved first. Each item (`StaffCaseSummary`):

| Field | Notes |
|---|---|
| `id`, `subject_kind`, `subject_id` | |
| `status`, `severity` | |
| `reasons` | distinct reasons, most reported first |
| `report_count`, `reporter_count` | |
| `opened_at`, `last_reported_at`, `resolved_at` | |
| `preview` | up to 140 characters of the reported text or the subject's title; null for photos |
| `owner` | `{ id, display_name, handle, paused }` or null |
| `assigned_to` | `{ id, display_name }` or null |
| `content_hidden` | the subject is hidden right now |

`counts`: `{ open, reviewing, high_open }` across everything (for the tab badges). Audited `view_queue`.

### `staff_case(p_case_id uuid) → jsonb StaffCaseDetail`

| Field | Notes |
|---|---|
| `case` | everything in the summary, plus `resolution` (`actioned` / `dismissed`), `resolution_note`, `resolved_by` `{id, display_name}` |
| `subject` | `StaffSubject` (below): the content now |
| `snapshot` | `StaffSubject` as it was when reported (null if it couldn't be read then) |
| `reports[]` | `{ id, reporter: {id, display_name, handle}, reason, note, created_at, status }`, newest first |
| `related[]` | other cases on the same subject or against the same owner, newest first (max 20): summary shape |
| `owner_history` | `StaffUserHistory` (below) for the owner, or null |
| `hide` | the active hide `{ id, hidden_at, hidden_by, reason }` or null |
| `actions[]` | audit entries for this case, newest first |

`StaffSubject`: `{ kind, id, exists, title, text, media: [{ bucket, path, alt_text }], author:
{id, display_name, handle} | null, context: { label, crew_id?, activity_id?, event_id?, plan_id?,
program_id?, clan_id? }, created_at, deleted (the author deleted it), hidden (staff hid it) }`.
`title` is a short label ("Message in Sunday Crew", "Plan: Football at Parc Jarry, Sat 18:00",
"Profile: Femi A"). Places give their name and area, never coordinates. Audited `view_case`.

### `staff_user(p_user_id uuid) → jsonb StaffUserDetail`

`profile` `{ id, display_name, handle, area, joined_at, onboarded }`, `staff_role`, `paused`
(current pause or null), plus `StaffUserHistory`:

| Field | Notes |
|---|---|
| `pauses[]` | `{ id, reason, note_to_user, staff_note, starts_at, ends_at, restored_at, restored_by, restore_reason, active }`, newest first |
| `cases_against` | `{ total, actioned, dismissed, open }` and `recent[]` (summary shape, max 20) |
| `reports_made` | `{ total, last_30_days, dismissed }` (reporters who only file dismissed reports stand out) |
| `hides[]` | content of theirs hidden by staff `{ id, subject_kind, subject_id, hidden_at, reason, restored_at }` |
| `appeals[]` | `AppealSummary`, newest first |
| `corrections[]` | reputation corrections on them `{ id, kind, activity_id, giver_id, created_at, reason }` |
| `blocked_by_count` | how many people blocked them (not who) |

Audited `view_user`.

### `staff_find_users(p_query text, p_limit int = 20) → jsonb { items }`

By handle or display name (case-insensitive prefix / contains, at least 2 characters). Items:
`{ id, display_name, handle, area, paused, staff_role }`. Never by phone. Audited `find_users`.

### `staff_appeals(p_status text[] = {open}, p_kinds text[] = null, p_limit int = 50, p_cursor text = null) → jsonb`

Oldest first for open, newest decided first otherwise. Items `AppealSummary`: `{ id, kind, status,
user: {id, display_name, handle}, subject_id, message (first 140 characters), created_at, decided_at,
decided_by }`. `counts: { open }`. Audited `view_appeals`.

### `staff_appeal(p_appeal_id uuid) → jsonb`

`appeal` (full: `message`, `decision_note`, `correction_effect`), `user` (the profile shape),
`subject`: for `account_pause` the pause row; for `content_hidden` the hide row plus the hidden
content (`StaffSubject`, from the kept original) and its case; for `show_up` the game `{ activity_id,
sport_id, starts_at, place: {name, area}, host: {id, display_name}, attendance_status, checked_in_count,
confirmed_count }`. `actions[]` audit entries. Audited `view_appeal`.

### `staff_audit_log(p_actor uuid = null, p_target_user uuid = null, p_actions text[] = null, p_case_id uuid = null, p_limit int = 50, p_cursor text = null) → jsonb`

Newest first. Items `AuditEntry`: `{ id, at, actor: {id, display_name} | null (SQL / system), action,
subject_kind, subject_id, target_user: {id, display_name} | null, case_id, appeal_id, reason, detail }`.
Audited `view_audit`.

**Actions** (`AuditAction`): `grant_staff`, `revoke_staff`, `assign_case`, `resolve_case`,
`dismiss_case`, `hide_content`, `restore_content`, `pause_account`, `restore_account`,
`decide_appeal`, `void_reputation`, `correct_show_up`, `set_place_sensitive`, and the reads
`view_queue`, `view_case`, `view_user`, `find_users`, `view_appeals`, `view_appeal`, `view_audit`.

### `staff_places(p_query text = null, p_sensitive boolean = null, p_limit int = 50) → jsonb { items }`

Places by name / area: `{ id, name, area, city, sensitive, sport_ids }`. Public data, not audited.

## Staff writes

Every write: staff only, `p_reason` required (1–500 characters, `reason_required`) unless noted,
`p_idempotency_key` required, audited, returns jsonb with `changed` (false when it was already so).

| RPC | Does | Returns |
|---|---|---|
| `staff_assign_case(p_case_id, p_staff_id = null, p_idempotency_key)` | Assign to a staff member (null = me) → `reviewing`. `p_reason` not needed. Unassign: `staff_unassign_case(p_case_id, p_idempotency_key)` → `open`. | `{ case_id, status, assigned_to, changed }` |
| `staff_resolve_case(p_case_id, p_outcome, p_reason, p_idempotency_key)` | `p_outcome` = `actioned` \| `dismissed`. Closes the case and its reports. The reason is the resolution note. | `{ case_id, status, changed }` |
| `staff_hide_content(p_subject_kind, p_subject_id, p_reason, p_case_id = null, p_idempotency_key)` | Hide a message, update, challenge post, challenge comment or moment (see [Hidden content](#hidden-content)). | `{ hide_id, changed }` |
| `staff_restore_content(p_hide_id, p_reason, p_idempotency_key)` | Put it back as it was. | `{ hide_id, changed }` |
| `staff_pause_account(p_user_id, p_reason_code, p_reason, p_note_to_user = null, p_ends_at = null, p_case_id = null, p_idempotency_key)` | Pause an account. `p_reason_code` is a `report_reason`. `p_ends_at` null = until restored; else within 365 days. A pause while one is active replaces it (the old one is restored with reason "Replaced"). `p_note_to_user` (≤ 500) is shown to them. | `{ pause_id, ends_at, changed }` |
| `staff_restore_account(p_user_id, p_reason, p_idempotency_key)` | End the active pause now. | `{ pause_id, changed }` |
| `staff_decide_appeal(p_appeal_id, p_decision, p_reason, p_note_to_user = null, p_effect = null, p_idempotency_key)` | `p_decision` = `upheld` \| `denied`. Upheld does the fix: `account_pause` → restore account; `content_hidden` → restore content; `show_up` → a show-up correction with `p_effect` = `attended` (default: counts as showed up) or `excused` (doesn't count either way). | `{ appeal_id, status, changed }` |
| `staff_void_reputation(p_subject_id, p_giver_id, p_reason, p_activity_id = null, p_case_id = null, p_idempotency_key)` | Stop counting the signals `p_giver_id` gave `p_subject_id` (one game or all). The signals stay; the reads skip them. | `{ voided, changed }` |
| `staff_set_place_sensitive(p_place_id, p_sensitive, p_reason, p_idempotency_key)` | Mark a place sensitive or not (PRD §11.2, [`PLACES_CONTRACT.md`](PLACES_CONTRACT.md) Privacy). | `{ place_id, sensitive, changed }` |
| `staff_set_role(p_user_id, p_role, p_reason, p_idempotency_key)` | Admin only. `moderator` / `admin` / null (revoke). | `{ user_id, role, changed }` |

Hiding or pausing from a case does not close it: resolve the case as `actioned` when done.

## Paused accounts

A paused account (active row in `private.account_pauses`: not restored, started, not past `ends_at`):

- **Can't act or read:** `private.require_uid()`, which every app RPC calls, raises `account_paused`
  (detail: `ends_at` ISO or ''). Direct table writes the app makes (profile and privacy updates,
  storage uploads) are refused by RLS. Pauses past `ends_at` end by themselves.
- **Exempt** (work while paused): `my_account_status`, `my_appeals`, `submit_appeal` (kind
  `account_pause` only while paused), `my_staff_role`.
- **Disappears for everyone else:** `authz.is_blocked(a, b)` is true when either of two different
  people is paused, so every surface that hides blocked people (profiles, plans, chats, feeds, Discover,
  Pulse, Passport, Challenges, crews, clans, host rosters…) hides them the same way. Rows stay; a restore
  brings everything back.

**`my_account_status() → jsonb AccountStatus`** (any signed-in caller, paused or not):

| Field | Notes |
|---|---|
| `paused` | boolean |
| `pause` | `{ id, reason, note_to_user, starts_at, ends_at }` or null |
| `appeal` | the appeal on the current pause (`AppealSummary` + `decision_note`) or null |
| `can_appeal` | paused and no open appeal on it |
| `hidden_content[]` | your content hidden in the last 90 days: `{ hide_id, subject_kind, hidden_at, reason, restored_at, appeal_status }` |

App words: `pausedHeadline` "This account is paused", `pausedBody(pause)` ("Until 12 November." / "Until
Ojoro restores it."), `appealStatusLabel`.

## Hidden content

`staff_hide_content` works on kinds that are one person's words or photo: `message`, `update`,
`challenge_post`, `challenge_comment`, `moment`. Anything else raises `cannot_hide_kind`: for people,
plans, games, Challenges, crews, clans and programs, pause the owner; for places, mark sensitive.

- Text kinds read exactly like an author's delete (body null, `deleted_at` set): every existing read,
  count and placeholder applies. The original is kept in `private.content_hides.original` (staff only).
- Moments disappear from the moments table reads (restrictive RLS), from Crew Home's photo strip, and
  from the bucket for everyone but staff.
- `staff_restore_content` puts back the body / payload (or the moment) unless the author deleted it
  themselves before the hide.

## Appeals

`submit_appeal(p_kind, p_subject_id, p_message, p_idempotency_key) → jsonb AppealSummary`:

| `p_kind` | `p_subject_id` | Allowed when |
|---|---|---|
| `account_pause` | the pause id (from `my_account_status`) | it's your active pause |
| `content_hidden` | the hide id | your content is hidden right now |
| `show_up` | the activity id (from `my_missed_games`) | it counts as missed in your show-up record |

`p_message` 1–1000 characters. One open appeal per thing (`appeal_exists`, detail = its id); 5 a week
(`appeal_rate_limited`). Statuses: `open` → `upheld` | `denied` (`decision_note` = the staff's
`p_note_to_user`, shown to them).

- **`my_appeals() → jsonb { items: AppealSummary[] }`** with `decision_note`, newest first.
- **`my_missed_games(p_limit int = 20) → jsonb { items }`**: games that count as missed in your
  show-up record (confirmed, not checked in, ended, not cancelled, not corrected), newest first:
  `{ activity_id, sport_id, starts_at, place_name, place_area, appeal_status }`.

## Reputation corrections

`private.reputation_corrections` (append-only): `show_up_attended` / `show_up_excused` (user, activity)
and `signal_void` (subject, giver, optional activity). `passport_reputation`, `profile_reputation`,
`private.show_up_record` and the trusted-host count apply them: a voided signal is not counted, an
`attended` game counts as showed up, an `excused` game is dropped from both numbers. Attendance and
`reputation_signals` rows are never changed.

## Rate limits

Every limit raises a `*_rate_limited` code with the limit in `detail`. Existing ones are unchanged;
new ones are enforced by triggers on the table, so every write path is covered.

| Write | Limit | Code |
|---|---|---|
| Reports (`report`) | 20 / 24 h | `report_rate_limited` |
| Call-Outs (`create_call_out`) | `private.call_outs_per_day()` / 24 h | `call_out_rate_limited` |
| Chat messages (crew and game, `send_message`) | 20 / minute | `message_rate_limited` (20) |
| Game updates (`post_update`) | 6 / minute | `message_rate_limited` (6) |
| Challenge posts | 6 / minute | `message_rate_limited` (6) |
| Challenge comments | 10 / minute | `message_rate_limited` (10) |
| Pull-in invites | 20 / 24 h | `invite_rate_limited` |
| Plans from Down For | 5 / 24 h | `demand_rate_limited` |
| Crews created | 5 / 24 h | `crew_rate_limited` |
| Clans created / clan join requests | 3 / 10 per 24 h | `clan_rate_limited` |
| **Host join requests** (`ask_to_join`) — new | 20 / 24 h | `join_request_rate_limited` (20) |
| **Host announcements** (`send_announcement`) — new | 10 / hour per author | `announcement_rate_limited` (10) |
| **Appeals** (`submit_appeal`) — new | 5 / 7 days | `appeal_rate_limited` (5) |

## Block enforcement

`supabase/tests/42_trust_block_surfaces.sql` blocks one person and then tries every person-to-person
surface from Steps 1–7 from both sides: profile and Passport reads, reputation, plan visibility,
invites and pull-in, crew chat (sending, reading, mentions), game chat, game updates, call-outs to the
blocked person, Challenge comments, crew invites, clan join, host program visibility and join requests,
announcements' recipients, people to move with, report. The same file pauses an account and checks the
same surfaces hide them and refuse their writes.

## App surfaces

- `account_paused` from any call → the app shows `PausedScreen` (features/safety): "This account is
  paused", the pause words, the note from Ojoro, and APPEAL (or the appeal's status).
- You → reputation → "Something wrong with your record? Ask us to look." → `ShowUpAppealSheet`
  (pick a missed game, say what happened, SEND).

## Analytics

Server events in `private.analytics_events`: `report_submitted` (kind, reason, case_id, deduplicated),
`case_resolved` (outcome, severity, minutes open), `content_hidden`, `content_restored`,
`account_paused` (reason, has_end), `account_restored`, `appeal_submitted` (kind), `appeal_decided`
(kind, decision), `reputation_voided`. Client: `appeal_opened`, `appeal_sent` (in
`@ojoro/analytics`).

## Local data

`supabase/seed_trust.sql` (safe to re-run; after the other seeds): the two staff accounts above and a
few open cases from the seeded people (a harassment report with 3 reporters on a crew message, a spam
profile, an unsafe report on a game update) so the queue isn't empty.

## Not built

- Notifications to users when an appeal is decided or a pause starts/ends (they see it in
  `my_account_status` / `my_appeals`).
- Host / clan moderator roles inside their own communities (PRD §11.1): only Ojoro staff here.
- Age-aware restrictions (PRD §11.1): no birth date is collected yet.
- Automated detection (spam scoring, image scanning): reports only.
- Appeals of verification / results (PRD §11.3): results already have disputes and corrections in
  Competition and Host OS.
