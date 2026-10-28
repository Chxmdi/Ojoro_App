# Sheet

A bottom sheet for focused tasks inside a screen — invite, filter, pick a time.

**Properties** `title`, children, `actions` (bottom, full-width), `onClose`.
**Rules** top corners `radius-sheet`, `shadow-sheet`, grabber bar; sits over an `opacity-scrim` scrim. One sheet at a time; never a sheet on a sheet.
**Motion** slides up with `dur-gather` / `ease-breakthrough`; reduced motion: fades.
**Accessibility** `role=dialog`, `aria-modal`; focus moves to the title and returns to the trigger on close; swipe-down and the close button both dismiss.
