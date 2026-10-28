# Ojoro: design handoff for Claude Code

This folder is the starting point for building the Ojoro app with Claude Code. It holds the PRD, the OJORO KINETIC design system, all 44 screen designs (screenshots and a clickable prototype), and the instructions Claude Code reads on its own.

## Start

1. Unzip this folder where you want the app's repo to live, and make it a git repo (`git init`).
2. Open a terminal in the folder and run `claude`.
3. Paste the first prompt from `KICKOFF_PROMPT.md`. Claude Code reads `CLAUDE.md` automatically and the prompt points it at everything else.

## What's inside

```text
CLAUDE.md               Read by Claude Code every session: stack, rules, how to work, when to ask
KICKOFF_PROMPT.md       The first four prompts, in order
design-handoff/
  HANDOFF.md            Build brief: build order, what isn't designed yet, open decisions
  SCREENS.md            All 44 screens with purpose, route, PRD section, components, links
  DESIGN_SYSTEM_PORT.md How to turn the web design system into Expo components
  design-system/        Tokens, rules, component specs and the web reference
  screens/              Full-length PNG of every screen (2x)
  prototype/            The clickable prototype (see its README to run it)
  prd/                  OJORO PRD v3.0 (Markdown and the original .docx)
```

## View the prototype

```bash
cd design-handoff && python3 -m http.server 8080
```

Open http://localhost:8080/prototype/ for a gallery of every screen.

## Decisions waiting on you

Claude Code will ask about these: the backend, the payments and maps providers, the Ojoro service fee (host screens show placeholder amounts) and the display font licence (Anton stands in for Druk Condensed). The full list is in `design-handoff/HANDOFF.md`.
