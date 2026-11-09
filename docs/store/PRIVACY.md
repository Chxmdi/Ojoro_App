# Privacy answers for the stores

Apple's App Privacy ("nutrition label") and Google Play's Data safety form, answered from what the code
does today (November 2026). Re-check this file whenever a feature starts reading or storing something
new. The iOS privacy manifest (`apps/mobile/app.config.ts`, `ios.privacyManifests`) declares the same
data types; keep the two in step.

Where it comes from: Supabase is Ojoro's backend (ADR `docs/adr/0001-backend-supabase.md`). Supabase,
Stripe and Anthropic act as service providers (processors) for Ojoro; nothing is sold or used for
advertising. There is no ads SDK, no tracking SDK, no crash reporter and no third-party analytics SDK in
the app.

## What the app collects

| Data | Where in the code | Why | Linked to the person | Retention |
|---|---|---|---|---|
| Phone number | Supabase Auth phone sign-in (`(auth)/phone.tsx`, `code.tsx`) | Sign-in | Yes | Until account deletion |
| Email address, name | Only when Sign in with Apple / Google is turned on (`EXPO_PUBLIC_AUTH_APPLE`, `EXPO_PUBLIC_AUTH_GOOGLE`); the provider returns them to Supabase Auth. Native social sign-in isn't built, so store builds don't collect email today; it stays declared so the label is right the day it is turned on | Sign-in | Yes | Until account deletion |
| Name (display name, handle) | `profiles.display_name`, `profiles.handle` (onboarding Name) | Shown to other people | Yes | Until account deletion |
| Coarse location | Home area: a label ("Plateau, Montréal") and a point rounded to 0.01° (about 1 km) in `profile_private`; set in onboarding Area | Matching plans nearby | Yes | Until changed or account deletion |
| Precise location | Check-in: one reading sent to `check_in`, compared with the venue and **not stored**. Live share: `location_shares`, only while the person chooses to share for one game; deleted when they stop, when the game ends (+30 min) or by the minute job | Check-in; showing a game's players where you are | Yes | Check-in: not retained. Share: until the game ends |
| Photos | Picked from the system photo picker on a game's After (`features/after`), stored in the `moments` storage bucket | Recap of the game | Yes | Until the person or staff removes it, or account deletion |
| Messages | Crew chat, activity chat, Challenge comments (`messages`, `challenge_comments`) | Talking with the people you play with | Yes | Until deleted by the author or account deletion |
| Other user content | Plans, Down For signals, availability windows (as overlap), Challenges, results, reactions, polls, predictions (never money), reports | Core features; safety | Yes | Until account deletion (results stay as "Former member" so others' history stays true) |
| Fitness | Personal bests from Challenge results (`personal_bests`: discipline, time or distance), attendance, Passport stamps | Passport and rivalries | Yes | Until account deletion |
| Purchase history | Passes and memberships bought from hosts (`payment_checkouts`, `host_charges`); card details are entered on Stripe's hosted page and never reach Ojoro | Giving access to sessions; refunds | Yes | Kept for accounting after deletion, unlinked from the person ("Former member") |
| User ID | Supabase user id on every row | App function | Yes | Until account deletion |
| Product interaction | Server-recorded facts in `private.analytics_events` (event names and ids, never message text or names). The app's client `track()` has no provider attached yet, so client events stay on the device | Product analytics | Yes | Not yet bounded (see Questions) |
| Concierge request text | Sent to Anthropic for one answer, held in memory for the request only, never stored or logged (`docs/CONCIERGE_CONTRACT.md`) | Answering the request | Not retained | Not retained |

**Not collected:** contacts (sharing uses the system share sheet), camera, microphone, health records,
financial account or card numbers, browsing history, search history, advertising identifiers, device
identifiers for tracking, crash logs, background location. Push tokens: the `push_tokens` table exists but
the app can't obtain a token until `expo-notifications` is added (owner decision); when it is, add
"Device ID" (App functionality) to both forms.

## Apple App Privacy (App Store Connect → App Privacy)

"Do you or your third-party partners collect data from this app?" **Yes.**

For every type below: **Used for tracking: No.** **Linked to the user: Yes.**

| Category → type | Purposes |
|---|---|
| Contact Info → Phone Number | App Functionality |
| Contact Info → Email Address | App Functionality |
| Contact Info → Name | App Functionality |
| Location → Precise Location | App Functionality |
| Location → Coarse Location | App Functionality |
| User Content → Photos or Videos | App Functionality |
| User Content → Emails or Text Messages (in-app messages) | App Functionality |
| User Content → Other User Content | App Functionality |
| Health & Fitness → Fitness | App Functionality |
| Purchases → Purchase History | App Functionality |
| Identifiers → User ID | App Functionality |
| Usage Data → Product Interaction | App Functionality, Analytics |

Not declared: Payment Info (Stripe's hosted page in the browser, outside the app), Concierge text (processed
in real time and not retained, which Apple's definition excludes).

Tracking (App Tracking Transparency): **No.** No ATT prompt is needed.

## Google Play Data safety (Play Console → App content → Data safety)

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | Yes |
| Is all of the user data collected by your app encrypted in transit? | Yes (HTTPS to Supabase, Stripe and Anthropic) |
| Do you provide a way for users to request that their data is deleted? | Yes, **once in-app and web account deletion ship** (see `docs/RELEASE_GATES.md`). Google requires a web link for deletion requests. |

Collected (none is "shared": service providers acting for Ojoro don't count as sharing). None is optional
unless noted; all are processed for **App functionality**, plus **Analytics** for App interactions.

| Data type | Collected | Optional | Purposes |
|---|---|---|---|
| Location → Approximate location | Yes | No (area is part of onboarding) | App functionality |
| Location → Precise location | Yes | Yes (check-in and sharing are the person's choice) | App functionality |
| Personal info → Name | Yes | No | App functionality |
| Personal info → Email address | Yes | Yes (only with Google / Apple sign-in) | App functionality, Account management |
| Personal info → Phone number | Yes | Yes (when signing in another way) | App functionality, Account management |
| Personal info → User IDs | Yes | No | App functionality, Account management |
| Financial info → Purchase history | Yes | Yes | App functionality |
| Health and fitness → Fitness info | Yes | Yes | App functionality |
| Messages → Other in-app messages | Yes | Yes | App functionality |
| Photos and videos → Photos | Yes | Yes | App functionality |
| App activity → App interactions | Yes | No | App functionality, Analytics |
| App activity → Other user-generated content | Yes | Yes | App functionality |

Ephemeral processing (not "collected"): Concierge request text.

## What the privacy policy must say

Everything in the first table, plus: Supabase as host and processor (region of the hosted project), Stripe
for payments, Anthropic for the Concierge, how to delete the account, how blocks and reports work, that
predictions and backing never involve money, the minimum age (owner decision), and the contact address.

## Questions for the owner

1. Minimum age. No birth date is collected (`docs/TRUST_CONTRACT.md`), so age-aware restrictions from
   PRD §11.1 aren't built. The Terms need a minimum age; 16 is a reasonable floor for an app that shares
   live location between people who may not know each other.
2. Retention for `private.analytics_events`. Today it has no time limit.
3. Photo metadata. `expo-image-picker` is called with `quality: 0.8`; whether location EXIF survives
   re-encoding on Android hasn't been checked on a device. If it does, strip it before upload.
