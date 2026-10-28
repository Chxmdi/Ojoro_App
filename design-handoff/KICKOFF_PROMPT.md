# Prompts for Claude Code

Paste these one at a time, in order. Wait for each step to finish and review it before sending the next one.

## 1. Read and plan (no code yet)

```text
You're building Ojoro, a React Native + Expo app. Everything you need is in this repo: start with CLAUDE.md, then read design-handoff/HANDOFF.md, design-handoff/DESIGN_SYSTEM_PORT.md, design-handoff/design-system/README.md and the PRD sections on navigation (§8), the movement loop (§9.2–9.8), trust and privacy (§11), the data model (§14), non-functional requirements (§17), the roadmap (§18) and the definition of done (§20). Skim design-handoff/SCREENS.md and look at a few screenshots in design-handoff/screens/ (Main, Plan, GameOn, CallOut, HostHome).

Don't write code yet. Give me:
1. A short summary of the product and the design rules in your own words, so I can check you've got it.
2. 2–3 backend options for this app (auth, relational data, realtime plan counts, server-side authorization, storage, push), with trade-offs and your recommendation.
3. A plan for step 0 (foundation) and step 1 (primitives) from HANDOFF.md: folders, packages, scripts, and how you'll check visuals against the PNGs.
4. Any questions or conflicts you found between the PRD and the design.
```

## 2. Foundation

```text
Go with <backend you picked>. Do step 0 from HANDOFF.md: scaffold the Expo app in this repo (TypeScript strict, Expo Router with the five tabs), NativeWind v5 themed from design-handoff/design-system/tokens.json through a generated tokens file, the Situation wrapper, fonts, Storybook, lint/typecheck/test scripts, and the backend client. Fill in the Commands section of CLAUDE.md. Show me the tab shell running with each tab's background set to the right situation.
```

## 3. Primitives

```text
Do step 1 from HANDOFF.md, following DESIGN_SYSTEM_PORT.md sections 3–9. Port each primitive from the web reference with the same props, add a Storybook story for every variant and state in its spec, and the screen patterns from section 8. Then build the States screen as a check. Show me screenshots of the stories next to the web reference.
```

## 4. Vertical Slice 01

```text
Build Vertical Slice 01 end to end against the real backend (HANDOFF.md step 2): auth and onboarding, profile, Down For, I'M DOWN, Plan Forming with realtime counts, GAME ON, Activity, check-in, After, Recap, Run It Back. Data model from PRD §14; mutations idempotent; server-side authorization; analytics events; tests. Match each screen to its PNG in design-handoff/screens/ and list any differences. Seed data can reuse the names and places from the designs.
```

After that, continue milestone by milestone with the table in `design-handoff/HANDOFF.md`.
