# Countdown

Big display numerals to an event: days, hours, minutes (seconds only in the last hour).

**Properties** `days`, `hours`, `minutes`, `seconds`, `label`. The app passes values from a ticking hook; numerals use tabular figures.
**Rules** in a Challenge Event, the countdown leads while `stage` is `days`; replaced by TODAY. / ALMOST TIME. as it nears.
**Accessibility** `role=timer`; announces at most once per minute.
