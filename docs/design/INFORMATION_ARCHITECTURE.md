# Ojoro Information Architecture

## Product navigation

The primary mobile navigation is:

1. **Home** — what can happen now, friend intent, plans forming, Ojoro Daily.
2. **Discover** — activities, people, Crews, Clans, Places, Hosts and Challenges.
3. **Create** — Quick Plan, Activity, Challenge, Route, Crew/Clan and Tournament.
4. **Compete** — Call-Outs, live Challenges, rivalries, ladders, seasons and tournaments.
5. **You** — Physical Identity, Passport, goals, reputation, achievements and settings.

Global destinations outside the tab hierarchy:
- Search
- Notifications
- Chat
- Activity
- Plan Forming
- User profile
- Crew
- Clan
- Challenge
- Place
- Map
- Passport
- Settings
- Safety / report

## Canonical object ownership

| Object | Primary owner surface | Secondary entry points |
|---|---|---|
| User | You / profile | Feed, activity roster, friends, challenge |
| Crew | Home / social | Search, chat, profile |
| Clan | Discover / social | Compete, activity, profile |
| Intent signal | Home | Profile, Crew, notifications |
| Plan | Home / Plan Forming | Chat, map, notification |
| Activity | Home / Discover | Plan, Place, Crew, Clan, notifications |
| Challenge | Compete | Profile, Crew, Clan, feed |
| Place | Discover / Map | Activity, search |
| Match | Compete | Activity, Clan |
| Passport | You | Share card, profile |
| Recap | Home / You | Activity, Crew, Clan |

## Navigation contracts

### Home → action
Home objects may only be promoted if they offer one or more meaningful actions:
- I’M DOWN
- JOIN
- PULL ME IN
- NEED ONE MORE
- CHALLENGE
- TRAIN WITH
- BACK THIS
- RUN IT BACK
- VIEW LIVE

### Back behavior
- Returning from a detail route restores scroll position and filters.
- Dismissing a sheet returns to the exact originating context.
- Deep-linked objects open in the appropriate stack and preserve a valid return path to the app shell.
- Completing an action never unexpectedly returns the user to root.

### Deep links
Canonical scheme: `ojoro://`.

Examples:
- `ojoro://activity/:id`
- `ojoro://plan/:id`
- `ojoro://challenge/:id`
- `ojoro://crew/:id`
- `ojoro://clan/:id`
- `ojoro://place/:id`
- `ojoro://profile/:id`

## Core flow map

### Movement
Home → Down For → Plan Forming → GAME ON → Activity → Live → AFTER → Recap → Run It Back.

### Crew
Crew Chat → Make This a Game → Availability → Place → Plan Forming → Activity.

### Challenge
Friend Profile → Challenge → Accept / Counter / Pass → Live Progress → Result → Rematch.

### New user
Welcome → Sports → Skill → Goals → Availability → Radius → Friends → First opportunity → Activity → Recap → Crew suggestion → Passport.

### Clan
Clan → Mission / Rivalry → Roster → Clash → Result → Recap → Rivalry history.

### Ojoro Now
Home → Ojoro Now → no matching activity → latent demand → Plan Forming → confirmed activity.

## Full-screen vs sheet rules

Use full screens for:
- objects with persistent URLs or meaningful history;
- activities, profiles, Crews, Clans, Challenges, Places, Passport;
- multi-step creation;
- maps;
- live and recap states.

Use bottom sheets for:
- RSVP confirmation;
- quick filters;
- invite selection;
- action menus;
- report/block;
- time/place proposals;
- lightweight conditional intent.

Use dialogs only for destructive, irreversible or high-risk confirmation.

## Exit criterion

The architecture is complete when every item in `SCREEN_INVENTORY.md` maps to a canonical route, sheet, modal, or reusable state and every Tier-A flow has a complete entry/exit path.
