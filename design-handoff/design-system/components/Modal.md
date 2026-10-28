# Modal

A centred confirmation for irreversible or socially costly actions only — leaving a plan, cancelling a Challenge.

**Properties** `title` (a display question), `body` (say the consequence in counts), `confirm`, `cancel`, handlers.
**Rules** square, a `border-poster` rule on top; the safe choice is the secondary button and is focused first. Never use a modal for information — use a Toast.
**Accessibility** `role=alertdialog` with labelled title and description; Escape cancels.
