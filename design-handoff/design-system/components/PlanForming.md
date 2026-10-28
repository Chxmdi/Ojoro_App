# PlanForming

A plan gathering people to a threshold, through to NEED ONE MORE and GAME ON.

**Variants** (derived from count/capacity, or forced with `variant`) `early` (<50%) · `viable` · `almost` (≥75%) · `need-one-more` · `game-on` (switches the object to `data-theme="confirmed"`) · `expired`.
**Properties** `activity`, `count`, `capacity`, `participants`, `time`, `place`, `privacy`.
**Interactions** join (commit button) · invite (PULL SOMEONE IN on need-one-more) · leave · open.
**States** loading · offline (show last count + "OFFLINE") · stale (count greyed until refresh) · full · error.
**Motion** Gather on each join; Breakthrough when the last spot fills (ground takes over).
**Haptic** Success notification on the threshold.
**Analytics** `plan_viewed`, `im_down_tapped`, `friend_invited`.
**Accessibility** "Football plan forming. Seven of eight participants committed. One more participant needed."
