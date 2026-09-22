# OJORO

**The social network for real-world movement.**

Ojoro turns **“I want to do something”** into **“we’re doing it at 7.”**

The fundamental unit of Ojoro is not content. It is **shared real-world action**.

## Core loop

`INTENT → ASSEMBLE → COMMIT → MOVE → VERIFY → BELONG → PROGRESS → DISCOVER → REPEAT`

## Signature mechanics

- **I’M DOWN** — the atomic commitment signal
- **Plan Forming** — compatible intent becomes a real plan
- **Crews** — private friend-group movement layer
- **Clans** — persistent real-world communities
- **Ojoro Now** — what can I actually do right now?
- **Need One More** — fill missing roster spots
- **Pull Me In** — proactively include me in relevant plans
- **Call-Outs** — safe social challenges
- **Run It Back** — repeat great activities
- **Passport** — the record of a life in motion
- **Places** — courts, fields, gyms, trails and venues as social objects
- **Movement Concierge** — AI that gets users out of the app and into real life

## Repository layout

- `apps/mobile` — React Native / Expo app
- `apps/web` — Next.js host/admin web app
- `apps/api` — API / domain backend
- `packages/*` — shared contracts, config, design tokens and analytics
- `.github/workflows` — CI/CD, security and release automation
- `.github/ISSUE_TEMPLATE` — structured issue forms
- `docs` — engineering, delivery, security and product documentation
- `project` — canonical issue/milestone/label manifests
- `scripts` — GitHub bootstrap and verification utilities

## Engineering principles

1. Privacy and safety are architectural requirements.
2. Server-side authorization is mandatory.
3. Every meaningful behavior emits stable product telemetry.
4. High-risk features ship behind flags.
5. No PR is done without test evidence.
6. Optimize for real-world movement, not app time.

See `docs/ENGINEERING.md`, `docs/PROJECT_STRUCTURE.md` and `docs/RELEASE_GATES.md`.
