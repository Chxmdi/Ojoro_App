# Button

Pill buttons for every action; `commit` is the I'M DOWN button.

**Variants** `primary` (signal fill, one per view) · `secondary` (line-strong outline) · `ghost` (underlined text) · `inverse` · `commit` (display face, `size-commit` tall).
**Properties** `variant`, `committed` (commit only — label becomes YOU'RE DOWN with a check), `block` (full width), plus native button props.
**Interactions** press compresses to 0.96 (`dur-commit`, `ease-commit`); commit toggles `aria-pressed`.
**States** default · pressed · committed · disabled (`opacity-disabled`, with a reason nearby) · loading (keep label, add spinner).
**Haptic** commit only: Light impact on I'M DOWN.
**Analytics** `im_down_tapped`, `cta_tapped{label}`.
**Accessibility** min height `size-touch`; label is the visible text; focus ring `focus`.

- Do: write product verbs in caps exactly — I'M DOWN, PULL SOMEONE IN, RUN IT BACK.
- Don't: put two `primary` buttons side by side; use `secondary` for the lesser action.
