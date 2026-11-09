# Store listing drafts

Drafts for App Store Connect and Google Play Console. The owner approves the copy before it goes in.
Written in Ojoro's voice (CLAUDE.md "Voice"): product verbs as fixed words, counts not adjectives,
no emoji, no exclamation marks. Character limits are the stores'; counts are given for each field.

Art: `apps/mobile/assets/icon.png` (1024, opaque, the App Store icon), `apps/mobile/assets/store/feature-graphic.png`
(1024×500, Google Play). Regenerate with `pnpm --filter @ojoro/mobile icons`. Screenshots are not
made yet (see [What's missing](#whats-missing)).

## Both stores

| Field | Value | Limit |
|---|---|---|
| App name | Ojoro | 30 (5) |
| Primary category | Social Networking (Apple) · Social (Google) | |
| Secondary category | Health & Fitness (Apple only) | |
| Price | Free. Program passes and memberships are paid to the host through Stripe in the browser (see "Payments" below). | |
| Support URL | **Owner provides** (must be a live page with a way to reach Ojoro). | |
| Marketing URL | Optional. | |
| Privacy policy URL | **Owner provides** (required by both stores; the Welcome screen already promises Terms and a Privacy Policy). | |
| Copyright | **Owner provides** (legal entity name and year). | |
| Contact email | **Owner provides** (Google shows it publicly). | |

## App Store (Apple)

| Field | Value | Limit |
|---|---|---|
| Subtitle | Plans that turn into games | 30 (26) |
| Promotional text | Say what you're down for. Ojoro finds the people, the time and the place, then gets you out the door. | 170 (101) |
| Keywords | pickup,run club,football,basketball,tennis,climbing,cycling,crew,plans,games,friends,challenge | 100 (93) |

Keywords leave out "Ojoro" (the name is indexed already) and use no spaces after commas.

### Description (App Store and Google Play full description)

```text
Say what you're down for. Ojoro finds the people, the time and the place, then gets you out the door.

I'M DOWN
Pick a sport and a window. When enough people near you are down for the same thing, a plan forms. Ojoro shows the count, not a promise: 3 of 4 down is PLAN FORMING, and NEED ONE MORE means one more.

GAME ON
When the plan has its people, time and place, it locks. Everyone gets the same details, and the plan becomes a game.

SHOW UP
Check in at the game. Share where you are with the people in that game if you want to, for that game only, until it ends.

AFTER
Every game becomes a recap: who came, photos from the people who were there, and a stamp in your Passport. RUN IT BACK sets up the next one with the same people.

CREWS AND CLANS
Keep the people you play with. A Crew is the group you run it back with. A Clan is a bigger side with missions and runs.

CHALLENGES
CALL OUT someone you play with. Results are confirmed by both sides, rivalries keep the score, and rematches are new games. No money, no odds, no stakes.

PLACES AND HOSTS
See the courts, tracks and gyms where games happen. Run clubs, leagues and coaches can host programs on Ojoro, with drop-ins, packs and memberships paid through Stripe.

PRIVACY
Ojoro shows areas, not addresses. Your availability is matched as overlap, never shown as a calendar. Your live location is shared for one game only, and only while you choose to. Block and report are on every profile, chat, plan and Challenge.

Football, running, basketball, volleyball, beach volleyball, climbing, cycling, tennis, boxing and rowing.
```

Length: about 1,900 characters (limit 4,000). The sports line is the seeded list in
`supabase/migrations/*` and must change with it.

### App Review notes (App Store Connect → App Review Information)

```text
Sign in with a phone number. Demo account: <owner adds a Supabase Auth test phone number and its fixed code, set under Authentication → Phone → test numbers on the hosted project>.

Location is requested only when the user taps CHECK IN at a game (one reading, compared with the venue and not stored) and while they choose to share their location with that game's players (stops at the end of the game). There is no background location.

Photos come from the system photo picker, only when the user adds photos to a game's After. There is no in-app camera.

Payments: hosts sell passes and memberships for in-person sessions (drop-ins at physical venues). These are services consumed outside the app (guideline 3.1.3(e)) and are paid on Stripe's hosted Checkout in the browser.

Predictions and backing on Challenges never involve money, odds or redeemable points.
```

## Google Play

| Field | Value | Limit |
|---|---|---|
| Short description | Say what you're down for. Ojoro finds the people, the time and the place. | 80 (74) |
| Full description | Same as the App Store description above. | 4,000 |
| App category | Social | |
| Tags | Sports, Social networking, Fitness (pick from Play's list) | |
| Feature graphic | `apps/mobile/assets/store/feature-graphic.png` | 1024×500 |
| App icon | `apps/mobile/assets/icon.png` exported at 512×512 (Play Console resizes on upload) | |

## Payments

Ojoro sells nothing itself. Hosts sell passes and memberships for in-person sessions, paid through Stripe
Checkout in the browser, which both stores allow for physical services. The payments code refuses live
Stripe keys today (`docs/PAYMENTS_CONTRACT.md`, "TEST MODE"): every payment screen says "Stripe test
mode. No real card is charged and no real money moves." Turning live mode on is a separate owner
decision with a code and a migration change; until then the listing must not promise real payments.

## What's missing

- **Screenshots.** Apple: 6.9" (1320×2868 or 1290×2796) at least 3; Google: phone, at least 2. Take them
  from a preview build on a device with seeded sample content, never real people's data.
- **Privacy policy, terms and support pages** (URLs above). See `docs/store/PRIVACY.md` for what they must say.
- **Account deletion inside the app and on the web.** See `docs/RELEASE_GATES.md`, "First store submission".
