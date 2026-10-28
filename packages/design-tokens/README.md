# @ojoro/design-tokens

OJORO KINETIC tokens as typed constants, generated from
`design-handoff/design-system/tokens.json` by `scripts/build-tokens.mjs`
(`pnpm tokens`). Don't edit `src/generated/` by hand.

Exports the six brand colours, the semantic colours per situation
(`calm`, `forming`, `confirmed`, `live`, `after`), text styles in absolute
px, spacing, radius, size, border, opacity, motion and the sheet shadow,
plus `situationVariables(id)` and `contrastRatio()`.
