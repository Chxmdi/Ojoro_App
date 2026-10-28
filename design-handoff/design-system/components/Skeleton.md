# Skeleton

Loading placeholders shaped like the object that's coming: strip, object or text.

**Variants** `strip` (time block, two lines, badge) · `object` (overline, display, progress, commit) · `text` (`lines`).
**Motion** a slow opacity breath on `dur-live`; static under reduced motion.
**Rules** show only after 300ms; never for more than one object's worth above the fold — then show a Toast if it's slow.
**Accessibility** `aria-busy` with a label ("Loading plans").
