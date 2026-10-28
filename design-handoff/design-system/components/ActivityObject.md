# ActivityObject

The full activity object: when (in display), what, where, who, how full, and what you can do.

**Variants (`status`)** `forming` (calm ground, count badge, I'M DOWN) · `confirmed` (switches to the confirmed situation, GAME ON badge) · `live` (live situation, LIVE pill).
**Properties** `activity`, `day`, `time`, `place`, `distance`, `level`, `count`, `capacity`, `people`, `joined`, `details` (set `false` on the activity's own page to hide the DETAILS link), `onJoin`, `onOpen`.
**Interactions** join · open details. **States** loading (Skeleton object) · offline (count frozen, Toast) · full · error.
**Motion** Gather on join; Breakthrough when it fills.
**Accessibility** "Pickup football, Thu 7:30, Jeanne-Mance Park. 6 of 10 in."
