# Release checklist: first native builds

What the owner provides and clicks, in order, to go from this repo to builds on phones and then to the
stores. The code side is ready: `apps/mobile/eas.json` has the profiles, `apps/mobile/app.config.ts` has
the ids, permissions, privacy manifest and deep links, the art is in `apps/mobile/assets/`, and the store
copy and privacy answers are drafts in `docs/store/`. What still blocks a store submission (as opposed to
an internal build) is listed in `docs/RELEASE_GATES.md`, "First store submission".

Nothing here is secret. Keys go into the Supabase dashboard / CLI, EAS environment variables and GitHub
secrets, never into the repo. Run commands from the repo root unless a step says `cd apps/mobile`.

## 0. Decisions first

| Decision | Options | Blocks |
|---|---|---|
| SMS provider for phone sign-in | Twilio, Twilio Verify, MessageBird, Vonage, Textlocal (set in Supabase, not in code) | Anyone signing in on a hosted project |
| Push notifications | Add `expo-notifications` and an Expo push sender, or ship without push (the app works without it; `apps/mobile/src/lib/push.ts`, ADR 0003) | Step 10 |
| Minimum age and the Terms | Suggested 16 (`docs/store/PRIVACY.md`, question 1) | Store forms, the privacy policy |
| Payments in the first store build | Keep Stripe **test mode** (every payment screen says so) or go live (a code change and a migration, `docs/PAYMENTS_CONTRACT.md`) | Step 5, App Review |
| Analytics provider | Still open (HANDOFF.md). The app runs without one. | Nothing for the first build |
| Bundle id / package | Default `com.ojoro.app` (development builds add `.dev`, preview `.preview`). To change: set `OJORO_IOS_BUNDLE_ID` / `OJORO_ANDROID_PACKAGE`, or edit the defaults in `app.config.ts` before the first upload. A store id can never change after it. | Steps 1–2 |

## 1. Apple

1. Enrol in the Apple Developer Program (developer.apple.com/programs; yearly fee). As an organisation
   you need a D-U-N-S number, which can take days.
2. In App Store Connect → Apps → **+** → New App: platform iOS, name **Ojoro**, primary language,
   bundle id `com.ojoro.app` (EAS can register it for you in step 8 if it isn't listed yet; then come
   back), SKU `ojoro-ios`.
3. Copy the app's **Apple ID** (App Store Connect → App Information, a number). Add it to
   `apps/mobile/eas.json`:

   ```json
   "submit": { "production": { "ios": { "ascAppId": "<that number>" }, "android": { ... } } }
   ```

4. Users and Access → Integrations → App Store Connect API → generate a key with the **App Manager**
   role. Keep the `.p8` file; EAS asks for it once (step 8) and stores it.

## 2. Google

1. Create a Google Play Console developer account (play.google.com/console; one-off fee). A **personal**
   account created after November 2023 must run a closed test with at least 12 testers for 14 days
   before it can publish to production; an organisation account doesn't.
2. Create app → name **Ojoro**, app, free. Fill App content (privacy policy URL, ads: no, data safety
   from `docs/store/PRIVACY.md`, content rating from `docs/store/AGE_RATING.md`, target audience).
3. Google Cloud → service account with access to the Play Console (Play Console → Users and
   permissions → invite the service account's email, "Release" permissions). Download its JSON key;
   EAS asks for it once (step 11) and stores it.
4. The **first** Android upload must be manual (Play's API refuses an app that has never had a build):
   upload the `.aab` from the first production build (step 8) in Play Console → Testing → Internal
   testing → Create release.

## 3. Expo / EAS

```bash
cd apps/mobile
pnpm dlx eas-cli@latest login          # the owner's Expo account
pnpm dlx eas-cli@latest init           # creates the project and prints its ID
```

`app.config.ts` is dynamic, so `eas init` can't write the ID itself. Paste it into the
`EAS_PROJECT_ID` line near the top of `apps/mobile/app.config.ts` (and the account or organisation name
into `EXPO_OWNER`), or export both in the shell and in CI. Then:

```bash
npx expo config --type public | grep -A2 '"eas"'    # shows the projectId
```

For GitHub Actions (`.github/workflows/mobile-delivery.yml`): expo.dev → Account settings → Access
tokens → create `EXPO_TOKEN`; in GitHub add secrets `EXPO_TOKEN`, `EAS_PROJECT_ID`, variable `EXPO_OWNER`,
and set variable `MOBILE_DELIVERY_ENABLED=true` when ready.

## 4. Supabase (hosted)

One project for production; a second one for preview builds is recommended so testers never touch
real data.

1. supabase.com → New project. Note the **project ref**, the region and the database password.
2. Apply the migrations (this changes a shared database: the owner runs it):

   ```bash
   npx -y supabase@2.122.0 login
   npx -y supabase@2.122.0 link --project-ref <ref>
   npx -y supabase@2.122.0 db push
   ```

   Then in the SQL editor check the extensions and jobs the migrations create:
   `select jobname, schedule from cron.job order by 1;` should list `ojoro_tick`,
   `ojoro_notify_tick`, `ojoro_challenge_tick`, `ojoro_ritual_tick`, `ojoro_host_tick`,
   `ojoro_host_ops_tick`, `ojoro_payments_drain` and `ojoro_trust_tick`. If it's empty, enable
   **pg_cron** and **pg_net** under Database → Extensions and run `db push` again.
3. Authentication → URL Configuration: Site URL `ojoro://`; Redirect URLs `ojoro://**`. (Don't use
   `supabase config push`: it would also push the local-only `localhost` and `exp://` entries.)
4. Authentication → Sign In / Providers → Phone: on, with the SMS provider from step 0 and its
   credentials. Add one **test phone number** with a fixed code for App Review and Play's pre-launch
   check (it goes in the review notes, `docs/store/LISTING.md`).
5. Leave Apple and Google sign-in **off** for native builds: the app's native social sign-in isn't
   built (`(auth)/welcome.tsx`), and turning on Google alone would also require Sign in with Apple
   (App Store guideline 4.8).
6. Project Settings → API Keys: copy the **publishable** key (`sb_publishable_…`) and the project URL
   (`https://<ref>.supabase.co`) for step 7. Never use the secret / service_role key in the app.
7. Edge Function secrets (Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY` and
   `SUPABASE_SERVICE_ROLE_KEY` itself). Put the values from steps 5 and 6 in a local file that is never
   committed, e.g. `supabase/functions/.env.production`:

   ```bash
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...
   STRIPE_MODE=test
   STRIPE_CONNECT_COUNTRY=CA
   PAYMENTS_CRON_SECRET=<a long random string>
   PAYMENTS_FUNCTIONS_URL=https://<ref>.supabase.co/functions/v1
   PAYMENTS_RETURN_ORIGINS=ojoro://
   ANTHROPIC_API_KEY=sk-ant-...          # optional, step 6
   ```

   ```bash
   npx -y supabase@2.122.0 secrets set --env-file supabase/functions/.env.production
   npx -y supabase@2.122.0 functions deploy     # all functions; verify_jwt per supabase/config.toml
   ```

8. Vault secrets for the payments queue (SQL editor; same random string as `PAYMENTS_CRON_SECRET`):

   ```sql
   select vault.create_secret('https://<ref>.supabase.co/functions/v1/payments-drain', 'payments_drain_url');
   select vault.create_secret('<PAYMENTS_CRON_SECRET>', 'payments_drain_secret');
   ```

9. Staff access to the admin tool (`apps/web`) follows `docs/TRUST_CONTRACT.md` (`private.staff_members`).

10. Account deletion (`docs/TRUST_CONTRACT.md`, "Deleting your own account"). Deploy the function (it is
    also covered by the deploy-all above; it needs no secrets beyond the built-in Supabase ones and keeps
    `verify_jwt` on), then check it answers a signed-out call with 401:

    ```bash
    npx -y supabase@2.122.0 functions deploy account-delete
    curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<ref>.supabase.co/functions/v1/account-delete   # 401
    ```

    Host `apps/web` (`pnpm --filter @ojoro/web build` → `apps/web/dist`, with `VITE_SUPABASE_URL` and
    `VITE_SUPABASE_PUBLISHABLE_KEY` of the hosted project) so that `https://<web host>/delete-account/` is
    public. Open it signed out: it must show "Delete your account" with no staff sign-in.

## 5. Stripe (test mode)

The functions refuse live keys today; this is the test-mode setup (`docs/PAYMENTS_CONTRACT.md`,
"Configuration").

1. Stripe dashboard, **test mode** → Connect → get started, Express accounts, platform profile.
2. Developers → API keys → secret key `sk_test_…` (or a restricted `rk_test_…`) → `STRIPE_SECRET_KEY`.
3. Developers → Webhooks → Add endpoint `https://<ref>.supabase.co/functions/v1/stripe-webhook`,
   "Events on your account": `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
   `checkout.session.expired`, `invoice.paid`, `invoice.payment_failed`,
   `customer.subscription.updated`, `customer.subscription.deleted`, `refund.created`,
   `refund.updated`, `refund.failed`, `charge.refunded`, `charge.dispute.created`,
   `charge.dispute.updated`, `charge.dispute.closed`. Its signing secret → `STRIPE_WEBHOOK_SECRET`.
4. Add a second endpoint at the same URL, "Events on Connected accounts": `account.updated`,
   `payout.created`, `payout.updated`, `payout.paid`, `payout.failed`, `payout.canceled`. Its signing
   secret → `STRIPE_CONNECT_WEBHOOK_SECRET`.
5. Re-run the `secrets set` from step 4.7 after filling these in.

## 6. Anthropic (optional)

Without a key the Concierge gives its rules-based answers and the app still works.

1. console.anthropic.com → API keys → create a key for Ojoro, with a monthly spend limit.
2. Run the live evaluation once before turning it on (about 48 calls, `docs/CONCIERGE_CONTRACT.md`):

   ```bash
   ANTHROPIC_API_KEY=... npx -y deno@2.1.4 run --allow-env --allow-net --allow-read --allow-write --allow-sys \
     supabase/functions/concierge/eval/run.ts --live
   ```

3. If it meets the bar in the contract, add `ANTHROPIC_API_KEY` to the function secrets (step 4.7).

## 7. EAS environment variables

Only `EXPO_PUBLIC_*` values, which are public by design (they ship inside the app). Each build profile
reads the EAS environment of the same name (`environment` in `eas.json`).

```bash
cd apps/mobile
for env in development preview production; do
  pnpm dlx eas-cli@latest env:create --environment $env --name EXPO_PUBLIC_SUPABASE_URL \
    --value https://<ref>.supabase.co --visibility plaintext
  pnpm dlx eas-cli@latest env:create --environment $env --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    --value sb_publishable_... --visibility plaintext
done
```

Use the preview project's URL and key for `development` and `preview` if you made one. Don't set
`EXPO_PUBLIC_AUTH_APPLE` / `EXPO_PUBLIC_AUTH_GOOGLE` (step 4.5). `EXPO_PUBLIC_APP_ENV` is already set
per profile in `eas.json`.

## 8. First builds

```bash
cd apps/mobile
pnpm dlx eas-cli@latest device:create                          # register test iPhones (link to open on each)
pnpm dlx eas-cli@latest build --profile development --platform all   # dev client: "Ojoro Dev", com.ojoro.app.dev
pnpm dlx eas-cli@latest build --profile preview --platform all       # internal test build: "Ojoro Preview"
pnpm dlx eas-cli@latest build --profile production --platform all    # store build: "Ojoro", com.ojoro.app
```

On the first iOS build EAS asks to sign in to Apple and offers to create the distribution certificate,
provisioning profiles and bundle ids: answer yes. On the first Android build it offers to generate the
upload keystore: answer yes (EAS keeps it; download a backup with `eas credentials`). Build numbers are
kept by EAS (`appVersionSource: remote`, `autoIncrement` on production); the store version is
`version` in `app.config.ts`.

Development builds: run `pnpm --filter @ojoro/mobile dev` on the same network and open the dev
client. `development-simulator` builds an iOS simulator app instead.

## 9. Over-the-air updates (optional)

`eas.json` already has a channel per profile and `app.config.ts` uses the `fingerprint` runtime policy,
but `expo-updates` isn't installed (no dependency was added without the owner's OK). To turn it on:

```bash
cd apps/mobile && npx expo install expo-updates
```

Then rebuild (step 8). After that, `pnpm --filter @ojoro/mobile eas:update:preview` publishes JS
changes to preview builds, and `.eas/workflows/pr-preview.yml` works.

## 10. Push notifications (owner decision)

Not in the build. To add later: `npx expo install expo-notifications`, add `'expo-notifications'` to
`plugins` in `app.config.ts`, plug the adapter in as `apps/mobile/src/lib/push.ts` describes, upload an
APNs key (`eas credentials`) and an FCM V1 service account key (Firebase project, `google-services.json`
via `android.googleServicesFile`), and build a sender for ADR 0003. Then add "Device ID" to the store
privacy answers.

## 11. Submit

Before the first submission, clear every item in `docs/RELEASE_GATES.md`, "First store submission".

```bash
cd apps/mobile
pnpm dlx eas-cli@latest submit --profile production --platform ios       # → TestFlight
pnpm dlx eas-cli@latest submit --profile production --platform android   # → Play internal testing, draft
```

Then in App Store Connect: listing from `docs/store/LISTING.md`, App Privacy from
`docs/store/PRIVACY.md`, age rating from `docs/store/AGE_RATING.md`, screenshots, review notes with the
test phone number, then Submit for Review. In Play Console: the same for the listing, promote the
internal release to closed testing (and production once allowed).

Account deletion links (needed for both reviews):

- **Google Play**: Play Console → App content → Data safety → "Data deletion": answer that users can request
  deletion, and give `https://<web host>/delete-account/` as the account deletion URL. Say in-app deletion
  is at You → menu → Account → Delete account.
- **App Store**: in the review notes, write where deletion is in the app (You → menu → Account → Delete
  account; type DELETE to confirm) and add the same web URL.

## Regenerating things

```bash
pnpm --filter @ojoro/mobile icons        # icon, adaptive icon, splash, favicon, feature graphic (needs Playwright + Chromium)
cd apps/mobile && npx expo config --type public    # check names, ids, permissions per EXPO_PUBLIC_APP_ENV
cd apps/mobile && npx expo-doctor                  # project health
```
