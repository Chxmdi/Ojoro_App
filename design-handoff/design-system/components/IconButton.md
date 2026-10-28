# IconButton

A round 44px button holding one icon — for navigation and secondary actions only.

**Variants** `plain` (default, headers) · `outline` (line-strong ring, on content) · `solid` (inverse fill — the one create action in a header).
**Properties** `icon`, `label` (required — becomes `aria-label` and tooltip), `count` (oxblood notification count with `mark-ring`), `disabled`.
**Interactions** press compresses to 0.92 with `dur-commit`.
**Rules** never use an IconButton for I'M DOWN or any commitment — those are words.
**Accessibility** `size-touch` hit area; the count is announced through the label ("Notifications, 3 new").
