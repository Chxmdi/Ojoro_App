# Ojoro Design System

## Visual thesis

**Kinetic Social** — sports culture × editorial magazine × streetwear × live city × premium consumer technology.

Ojoro should feel like a world-class sports publication became interactive and understood what people around the user were actually doing.

## Approved palette

- Black — `#000000`
- Ink — `#141515`
- Oxblood — `#290000`
- Graphite — `#45484A`
- Warm Stone — `#A7A08B`
- White — `#FFFFFF`

No legacy lime/acid accent is part of the current system.

## Typography

Two-role system:

1. **Display / editorial** — condensed, high-impact, athletic. Intended production direction: Druk Condensed–like licensed face.
2. **UI / body** — neutral grotesk. Inter/Satoshi/ABC Diatype–like proportions.

Until a licensed display face is selected, the prototype uses system typography with weight, tracking and scale to preserve hierarchy.

## Spacing

4-point base grid:
- 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64

## Shape

- Small radius: 10
- Medium radius: 18
- Large radius: 28
- Pill: 999
- Avoid placing every section inside rounded cards.
- Large editorial areas should use type, photography and whitespace directly on the canvas.

## Core components

1. OjoroScreen
2. ActionButton
3. ActionCard
4. StatusChip
5. AvatarCluster
6. PlanProgress
7. SectionHeader
8. Metric
9. ActivityCard
10. ChallengeCard
11. PlacePulse
12. PassportStamp
13. Bottom sheet
14. Modal confirmation
15. Tabs
16. Search / filters
17. Empty state
18. Skeleton / loading state
19. Toast / success acknowledgement
20. Safety action sheet

## State requirements

### I’M DOWN
Idle → Pressed → Committed → Threshold reached → Confirmed → Disabled.

### Plan Forming
Early intent → viable → near threshold → Need One More → GAME ON → expired / failed.

### Activity
Loading → available → joined → waitlisted → full → confirmed → live → complete → recap → cancelled.

### Challenge
Draft → sent → accept/counter/pass → active → verification pending → complete → rematch.

## Motion

Motion should communicate physical consequence:
- spring into commitment;
- avatars gather as social gravity increases;
- Plan Forming grows in density rather than decorative sparkle;
- GAME ON snaps into a high-contrast confirmed state;
- reduced-motion mode replaces movement with opacity/scale-free state transitions.

## Haptics

Use sparingly:
- I’M DOWN accepted
- GAME ON threshold reached
- Challenge accepted
- Check-in verified
- Match/Challenge completed

## Accessibility

- WCAG 2.2 AA contrast target
- 44×44 pt minimum touch target
- dynamic text support
- screen-reader labels for visual-only movement objects
- meaningful focus order
- no color-only status communication
- reduced-motion equivalent
- captions/alt text for user-contributed media where feasible
