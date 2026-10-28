# Toast

A short inverse strip confirming what just happened, with at most one action.

**Variants** `neutral` · `success` (check icon) · `offline` (offline icon) · `error` (alert icon, assertive). Kind is told by icon and wording — no colours.
**Properties** `message` (one sentence, counts not adjectives), `kind`, `action` (UNDO, RETRY, SEE SIMILAR).
**Rules** sits above the tab bar, 4s by default (8s with an action); never stack more than one.
**Accessibility** polite live region (assertive for errors); the action is a real button.
