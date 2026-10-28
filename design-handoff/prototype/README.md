# Ojoro prototype

The clickable prototype exported from the design canvas: 44 screens, linked into the prototype flows. Some host screens have working controls (switches, steppers, approve/decline, filters, the chart hover).

## Run it

Serve the `design-handoff` folder over HTTP (the gallery uses the screenshots next door). Opening the files directly from disk won't work.

```bash
cd design-handoff
python3 -m http.server 8080
# or: npx serve .
```

Then open http://localhost:8080/prototype/ for the gallery of every screen, or a screen directly, such as http://localhost:8080/prototype/Main.dc.html. Use a 390px-wide window (or the browser's device toolbar) for phone screens.

Fonts load from Google Fonts, so you need to be online for the right typefaces.

## What the files are

- `*.dc.html`: one file per screen. The markup uses the design system's web components through `<x-import component-from-global-scope="Ojoro.Name">` tags, with props written as kebab-case attributes. Values in `{{…}}` come from the small `renderVals()` class at the bottom of each file. That's where sample data and prototype state live.
- `support.js`: the runtime that renders the `.dc.html` format (includes React). Prototype only.
- `ds/ojoro/`: the design system's web reference (tokens CSS, components bundle).
- `canvas.json`: canvas layout, board titles and order.

**This is a reference, not app code.** Read it to get layout, copy, component choice and props. Build the real screens in React Native with the ported design system.
