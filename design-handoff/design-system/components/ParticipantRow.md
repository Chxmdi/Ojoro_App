# ParticipantRow

One person in a plan or event: avatar, name, a line of context and their status in words.

**Properties** `person`, `role` (`host` · `in` (I'M DOWN) · `invited` · `maybe` · `checked` (verified check-in)), `meta`, `action` + `onAction` (NUDGE, REMOVE for hosts).
**Rules** sort host first, then checked in, in, maybe, invited. Use inside a `role=list` container.
