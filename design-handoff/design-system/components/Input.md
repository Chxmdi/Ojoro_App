# Input

A text field: uppercase label above, a sunk well, a 2px bottom rule.

**Properties** `label` (required, always visible — never placeholder-only), `hint`, `error`, `icon`, `multiline`, plus native input props.
**States** default (line-strong rule) · focus (signal rule) · error (4px text-colour rule, alert icon and the word "Error:" — never red) · disabled.
**Accessibility** label is a real `<label for>`; hint and error are linked via `aria-describedby`; `aria-invalid` on error; 16px text so iOS doesn't zoom.
