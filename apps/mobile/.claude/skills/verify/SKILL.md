---
name: verify
description: Run the Ojoro mobile app (Expo web), Storybook and the local Supabase backend, and drive them as a user to verify a change.
---

# Verify the Ojoro app

## Bring it up
```bash
# Docker daemon (cloud containers start with it stopped)
docker info >/dev/null 2>&1 || (dockerd > /tmp/dockerd.log 2>&1 &)
# Local Supabase (repo root). Seeded; test phones +15555550100..103, code 123456 (Chimdi, Ade, Marcus, Lena)
npx -y supabase@2.122.0 start
# apps/mobile/.env needs EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 and the PUBLISHABLE_KEY from `supabase start`.
# Create .env BEFORE starting Expo: env is inlined at start (a missing .env gives HTTP 500 "Supabase config is invalid").
cd apps/mobile && NODE_OPTIONS=--max-old-space-size=8192 EXPO_PUBLIC_STORYBOOK_ENABLED=true BROWSER=none npx expo start --web --port 8100
```
One server serves the app at `http://localhost:8100/` and Storybook at `/storybook?STORYBOOK_STORY_ID=<title-kebab>--<story-kebab>` (e.g. `movement-planforming--interactive`, `screens-states--artboard`). Metro needs the 8 GB heap: with the default 2 GB it dies (exit 134) after many hot reloads.

## Sign in without the UI (Playwright)
Get a session with supabase-js `auth.verifyOtp({ phone, token: '123456', type: 'sms' })` and put
`JSON.stringify(session)` in localStorage key `sb-127-auth-token` for origin `http://localhost:8100`
(a Playwright `storageState`). Then `browser.newContext({ storageState, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })`.
Use `waitUntil: 'load'`, never `networkidle` (the HMR socket never idles).

## Drive
- Screens: click by role (`getByRole('tab', { name: /compete/i })`), read `aria-label`s (objects state their situation in words), screenshot at 390pt and compare with `design-handoff/screens/<Name>.png`.
- Backend: drive it like the app, with supabase-js clients signed in as two or more test users (RPCs from `docs/SLICE01_CONTRACT.md`); create your own plans with `create_plan`, never `db reset` a shared stack. Realtime: subscribe a second user to `plan:{id}` and watch `plans` UPDATEs.
- Design reference: serve `design-handoff/` (`python3 -m http.server 8080`) to see the original web components and prototypes.

## Gotchas
- Tabs stay mounted; the first `[role=heading]` in the DOM is the Home tab's, not the visible one.
- Two `plans` UPDATE events arrive on GAME ON (count, then status), ~1 ms apart.
