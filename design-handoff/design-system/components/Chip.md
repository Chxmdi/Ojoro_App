# Chip

Pill filter and choice control (sports, times, crews).

**Properties** `selected`, `onClick`, children (label).
**Layout** chips never shrink or wrap their label; a row that runs out of room scrolls sideways.
**States** default (line-strong outline) · selected (inverse fill + check) · focus.
**Accessibility** `aria-pressed`; min height `size-touch`; selection also shown by the check, not by fill alone.
