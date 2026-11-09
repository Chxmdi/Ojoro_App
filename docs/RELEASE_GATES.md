# Release Gates

## Pull request gate
- formatting/linting
- typecheck
- unit tests
- integration tests
- API contract tests when applicable
- dependency review
- static security analysis
- migration validation
- accessibility for critical flows
- E2E/visual evidence for user-facing changes

## Staging gate
- immutable build artifact
- migration preflight
- critical journey E2E
- challenge flow E2E
- block/report flow E2E
- observability green

## Production gate
- zero open P0/P1
- no unaccepted critical/high security finding
- rollback owner and procedure
- feature flag / kill switch for high-risk changes
- post-deploy smoke check
- release notes and support brief

## First native build gate (internal: development and preview profiles)

Ready in the repo (Polish RELEASE, November 2026). The owner's steps are in `docs/RELEASE_CHECKLIST.md`.

- [x] `apps/mobile/eas.json`: development (dev client, internal), development-simulator, preview
      (internal APK / ad hoc), production (store, `autoIncrement`); a channel and an EAS environment per
      profile; only `EXPO_PUBLIC_*` names in `env`, no secrets.
- [x] `apps/mobile/app.config.ts`: bundle id / package from env with `com.ojoro.app` defaults, `.dev` /
      `.preview` suffixes so internal builds install beside the store app; scheme `ojoro`
      (plan, Stripe `pay/return`, Connect `host/<id>/payments`, Auth redirects); iOS usage strings for
      location (when in use only) and photos, no camera, microphone, motion or "always" strings; Android
      permissions limited to location, with storage, media and background location blocked; iOS privacy
      manifest; no export-compliance question (`usesNonExemptEncryption: false`); phone-only (no iPad);
      `fingerprint` runtime version; updates URL once the EAS project id is set.
- [x] Art from the brand: icon, adaptive icon (with monochrome layer), splash on oxblood, favicon, Play
      feature graphic (`pnpm --filter @ojoro/mobile icons`).
- [x] `npx expo config --type public` resolves for every `EXPO_PUBLIC_APP_ENV`.
- [ ] `npx expo-doctor`: 19 of 21 checks pass. Open: (1) the `storybook` script shares its name with the
      `storybook` binary (kept: CLAUDE.md documents `pnpm --filter @ojoro/mobile storybook`); (2) the
      Storybook on-device controls addon wants `@react-native-community/datetimepicker` and
      `@react-native-community/slider` as native peers. Neither affects release builds (Storybook is
      stripped from them); a dev-client build with Storybook on would crash on a date or slider control.
      Owner: install the two peers or drop those controls.
- [ ] Owner accounts, EAS project id, hosted Supabase and EAS environment variables
      (`docs/RELEASE_CHECKLIST.md` steps 1–7).

## First store submission (blocks App Store / Google Play review)

- [ ] **In-app account deletion** (App Store guideline 5.1.1(v); Google Play account deletion policy, which
      also needs a web page for requests). Today the only path is deleting the Auth user from the dashboard
      or Admin API (`docs/TRUST_CONTRACT.md`, "Account deletion"); the database side is ready. Needs an
      Edge Function or RPC the person calls for themself, an entry in You / settings, and a web form.
- [ ] Privacy policy, terms and support URLs live (`docs/store/LISTING.md`, `docs/store/PRIVACY.md`). The
      Welcome screen already says "By continuing you agree to the Terms and Privacy Policy" without links.
- [ ] Minimum age decided and written in the Terms (`docs/store/PRIVACY.md`, question 1).
- [ ] SMS provider set on the hosted project and a review test number added (checklist step 4).
- [ ] Payments: either keep test mode and say so in the review notes (every payment screen shows TEST
      MODE), or turn live mode on (code + migration, owner decision). App Review may question a test-mode
      checkout in a store build; hiding host payments in the first store build is the other option.
- [ ] Screenshots (6.9" iPhone, Android phone) from a preview build with seed data.
- [ ] Deep link `ojoro://clan/join/<code>` (written by `features/clans/logic.ts` in the Clan invite
      message) has no route; it lands on not-found. Either add `app/clan/join/[code].tsx` or change the
      link to the crew-style `?code=` form.
- [ ] `.github/workflows/mobile-delivery.yml`: the `eas-cli build` line is missing the closing quote
      after `--platform "${{ inputs.platform }}`; the job fails to parse its shell line.
- [ ] VoiceOver / TalkBack, large text and reduced-motion pass on a device build (CLAUDE.md).
