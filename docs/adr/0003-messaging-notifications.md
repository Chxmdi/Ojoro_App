# ADR 0003: Messaging, notifications and the action feed

- Status: proposed (needs the owner's review before any hosted migration or real push delivery)
- Date: 2026-10-29
- Scope: Step 4 backend (PRD M5). Contract: `docs/MESSAGING_CONTRACT.md`.

## Context

M5 adds conversation (crew and activity chat, Make This a Game), Live (score, updates, reactions,
followers), in-app notifications with push settings, and the finite action feed. ADR 0001/0002 rules
apply: RLS for reads, SECURITY DEFINER RPCs for writes, idempotency keys, realtime via
`postgres_changes`, analytics outbox. Sending real notifications needs the owner's OK.

## Decisions

1. **Notifications are rows generated in the database**, by AFTER triggers on the objects that
   change (plans, invites, attendance, activities, results, recaps, crew members) and inside the
   Step 4 RPCs (mentions, Make This a Game). One open row per person and bundle key; repeats update
   it. Rows hold facts; words are built at read time from objects the reader can see.
2. **Visibility twice:** at creation (`authz.can_see_object`, no block with the actor) and at every
   read (RLS and `private.notification_feed`).
3. **Delivery is a decision, not a send:** `private.would_send` / `private.delivery_queue` apply
   per-type settings, object mutes, quiet hours, a 30-minute throttle and lock-screen privacy. An
   Edge Function (sketched in the contract) would call Expo's push API once approved.
4. **Crews are private groups with explicit roles** (owner/admin/member). Plans gain a `crew`
   audience; `authz.can_see_plan` honours it, so every existing read and RPC follows.
5. **Chat is one `messages` table** for crew and activity threads, soft-deleted, read through RPCs
   that apply the block rules (placeholder for the blocker, nothing for the blocked).
6. **Make This a Game is rules-based**, runs on send, stores derived facts only, and never creates
   a plan without a tap.
7. **Live state lives in `activity_live`** (score, freshness, follower and reaction counts), with an
   `activity_updates` feed. Counts are denormalised so realtime carries them; who reacted or follows
   is never listed.

## Consequences

- Triggers fire for direct SQL too (seeds, tests): seed files rewrite notifications after loading.
- Changing what an event notifies means changing one trigger function, not every RPC.
- The `section` / `needs_you` logic is computed per read; it scales with one person's notifications,
  which stay small (bundling, and read rows can be pruned later).
- Real push needs: the owner's OK, an Expo access token secret, a schedule, receipt handling.
