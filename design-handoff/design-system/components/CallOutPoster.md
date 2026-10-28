# CallOutPoster

A Call-Out: one person challenges another. Black ground, names at display-xl, the Mark as the VS slash.

**Properties** `challenger`, `opponent`, `discipline`, `when`, `status` (`PENDING` · `ACCEPTED` · `COUNTERED` · `DECLINED`), `actions` (shows the recipient's three choices), `onAccept`, `onCounter`, `onPass`.
**Interactions** ACCEPT (primary) creates the Challenge Event · COUNTER (secondary) opens the rules to change time, distance, course or format · PASS (ghost) declines quietly, with no notification wording that shames.
**Rules** always `data-theme="live"`; accepting turns it into a `ChallengeEventHero`.
**Haptic** Heavy impact on accept. **Analytics** `callout_sent`, `callout_accepted`.
