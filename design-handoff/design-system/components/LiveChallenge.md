# LiveChallenge

The live state of a Challenge: two lanes racing toward the target, on black.

**Properties** `a`, `b` (`{name, value, checkedIn}`), `discipline`, `unit`, `target`, `elapsed`, `watching`.
**Rules** always the live situation. Each lane names its competitor and value in display — the leader is told by numbers, never by colour alone.
**Motion** Live — lane fills ease on `dur-live`; no layout movement.
**Accessibility** each lane is labelled "Chimdi 3.4 KM of 5, checked in"; updates announced at most every 30s.
