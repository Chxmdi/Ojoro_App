# Poll

A crew decision in one tap — times, places, formats.

**Properties** `question` (display, a question), `options` (`{label, votes}`), `voted` (index — shows results), `closes`, `onVote(index)`.
**States** open (option buttons) · voted (results with fills, your option checked and outlined) · closed (results, no check).
**Rules** 2–4 options. Results show percentages in words and fills; your choice is marked by a check and outline, not colour.
**Accessibility** open = `radiogroup`; results = list with "Thu 7:30, 58 percent, your vote".
