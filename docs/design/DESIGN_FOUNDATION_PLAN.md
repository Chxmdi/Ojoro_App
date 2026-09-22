# D0 — Ojoro Design Foundation

## Purpose

Before production feature engineering accelerates, Ojoro will complete a design-first phase that makes the product architecture visible, testable and implementation-ready.

The rule is:

> **Design nearly the entire app first. Do not implement the entire frontend first.**

Engineering begins against a stable design system and validated core prototype, then proceeds in vertical slices that connect UI, API, data, realtime, analytics, safety and automated tests.

## D0 exit gate

D0 is complete only when:

- the global information architecture is approved;
- the complete screen inventory is defined;
- the design system is production-ready;
- all critical flows are high fidelity;
- core interaction states are specified;
- the clickable core prototype works end-to-end;
- accessibility requirements are documented;
- responsive/mobile behavior is specified;
- analytics and backend contracts needed by the UI are identified;
- engineering handoff has component specs, tokens, states and acceptance criteria;
- no unresolved high-risk UX ambiguity remains in the core loop.

## Design order

1. Information architecture and screen inventory
2. Brand system and design tokens
3. Global navigation and app shell
4. Onboarding and Physical Identity
5. Home / Ojoro Daily / Action Feed
6. Down For and I’M DOWN
7. Plan Forming / Social Gravity / GAME ON
8. Ojoro Now and discovery
9. Activity details and creation
10. Need One More / Pull Me In
11. Friends, Crews and chat-to-plan
12. Clans, teams and host/community surfaces
13. Challenges, Compete, Call-Out and rivalries
14. Maps, Places and privacy-safe presence
15. Live activity, verification and recap
16. Run It Back and recurring rituals
17. Goals, progress, Passport and reputation
18. Notifications, search, calendar and settings
19. Error, empty, loading, offline and permission states
20. Clickable prototype, accessibility review and engineering handoff

## Core prototype

The prototype must support this exact story without dead ends:

**Open Ojoro → Football Tonight → I’M DOWN → Plan Forming 4/8 → 7/8 → Need One More → 8/8 → GAME ON → Activity Detail → Live → Recap → Run It Back.**

It must also support:

- Crew chat → “Basketball tomorrow?” → MAKE THIS A GAME → availability → place → Plan Forming → confirmed activity
- Friend profile → CHALLENGE → ACCEPT / COUNTER → live progress → result → REMATCH
- New user → onboarding → beginner-friendly discovery → first activity → recap → Crew suggestion → Passport milestone
- Clan → mission/rivalry → roster → Clash → recap
- Ojoro Now → no existing activity → latent demand → create activity from intent

## Experience principles

- The fundamental social object is shared real-world action.
- I’M DOWN is the primary commitment primitive.
- Every feed object should have an action pathway.
- Location should make the city feel alive without exposing people.
- Competition should feel prestigious, social and safe.
- Status comes from doing, helping, improving and showing up.
- AI should orchestrate action invisibly rather than dominate the interface.
- Ojoro should naturally produce stopping cues such as “You’re caught up. Go do something.”

## Visual system

Approved palette:
- Black — #000000
- Ink — #141515
- Deep Maroon — #290000
- Charcoal — #45484A
- Taupe — #A7A08B
- White — #FFFFFF

Direction:
- premium;
- editorial;
- kinetic;
- athletic;
- urban;
- documentary;
- human;
- sophisticated rather than cartoonishly gamified.

Avoid generic SaaS cards, purple AI gradients, excessive glass, esports HUDs, childish badge systems and infinite-scroll visual conventions.

## Design artifacts required

- mobile app map / IA
- screen inventory
- user-flow diagrams
- design-token specification
- typography specification
- component library
- navigation model
- motion specification
- high-fidelity screen designs
- prototype
- empty/loading/error/offline states
- accessibility annotations
- analytics-event annotations
- backend/data dependency annotations
- engineering handoff specification
- design QA checklist

## Engineering rule after D0

Once D0 passes, production development proceeds in **vertical slices**:

**UI + API + database + realtime + tests + analytics + safety**

Do not implement the whole frontend against fake data before backend work. Each slice should become genuinely usable and verifiable before the next major slice.
