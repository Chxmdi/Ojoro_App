// Generates the app icon, Android adaptive icon layers, splash mark, favicon and the Play feature
// graphic from the brand art: the O (design-system Graphic `kind="o"`, a ring on the 48 grid) in
// brand-white on brand-oxblood, the ground of the Welcome screen. The design system has no logo file
// yet ("set the name in the display face until one exists"), so the O is the mark.
//
// Colours come from design-handoff/design-system/tokens.json (brand-* tokens, brand art only), never
// hard-coded here. Output is deterministic; the SVG sources are written next to the PNGs so a designer
// can replace them.
//
// Run from the repo root:  node apps/mobile/scripts/build-app-icons.mjs
// Needs Playwright with Chromium (`npm i -g playwright && npx playwright install chromium`); it renders
// the SVG in a headless browser, so the repo takes no image dependency.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mobile = join(here, '..');
const root = join(mobile, '..', '..');
const out = join(mobile, 'assets');
const require = createRequire(import.meta.url);

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright is not installed. Run `npm i -g playwright && npx playwright install chromium`.');
  process.exit(1);
}

const tokens = JSON.parse(readFileSync(join(root, 'design-handoff/design-system/tokens.json'), 'utf8'));
function brand(name) {
  const token = tokens.color.tokens.find((t) => t.name === `brand-${name}`);
  if (!token || typeof token.value !== 'string') throw new Error(`brand-${name} is missing from tokens.json`);
  return token.value;
}
const OXBLOOD = brand('oxblood');
const WHITE = brand('white');
const BLACK = brand('black');

// app.config.ts repeats two of these for the splash and root grounds; refuse to build art that disagrees.
const appConfig = readFileSync(join(mobile, 'app.config.ts'), 'utf8');
for (const [name, value] of [
  ['OXBLOOD', OXBLOOD],
  ['WHITE', WHITE],
]) {
  const match = new RegExp(`const ${name} = '(#[0-9a-fA-F]{6})'`).exec(appConfig);
  if (!match || match[1].toLowerCase() !== value.toLowerCase()) {
    console.error(`app.config.ts ${name} must be ${value} (brand token); found ${match ? match[1] : 'nothing'}.`);
    process.exit(1);
  }
}

// The O on the 48 grid: circle r=20. Icons use strokeWidth 6 (Graphic's `strokeWidth` prop, twice the
// default 3) so the ring holds at 29pt. `outer` is the ring's outer radius in px.
function ring({ cx, cy, outer, color }) {
  const scale = outer / (20 + 6 / 2);
  return `<circle cx="${cx}" cy="${cy}" r="${20 * scale}" fill="none" stroke="${color}" stroke-width="${6 * scale}"/>`;
}

function svg(w, h, body, ground) {
  const bg = ground ? `<rect width="${w}" height="${h}" fill="${ground}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bg}${body}</svg>\n`;
}

const anton = readFileSync(
  require.resolve('@expo-google-fonts/anton/400Regular/Anton_400Regular.ttf', { paths: [mobile] }),
).toString('base64');

const assets = [
  {
    // iOS and the Android legacy icon. Opaque: the App Store refuses an icon with transparency.
    file: 'icon',
    w: 1024,
    h: 1024,
    svg: svg(1024, 1024, ring({ cx: 512, cy: 512, outer: 272, color: WHITE }), OXBLOOD),
  },
  {
    // Adaptive icon foreground. The launcher masks to the centre 66dp of 108dp (≈626px of 1024), so the
    // ring stays inside it with room for the mask's motion.
    file: 'adaptive-icon',
    w: 1024,
    h: 1024,
    transparent: true,
    svg: svg(1024, 1024, ring({ cx: 512, cy: 512, outer: 236, color: WHITE })),
  },
  {
    // Android 13 themed icon: the launcher tints this alpha mask.
    file: 'adaptive-icon-monochrome',
    w: 1024,
    h: 1024,
    transparent: true,
    svg: svg(1024, 1024, ring({ cx: 512, cy: 512, outer: 236, color: BLACK })),
  },
  {
    // Splash mark, drawn on the oxblood ground set in app.config.ts. Android 12+ shows the centre
    // two thirds of it in a circle, so the ring stays inside that.
    file: 'splash-icon',
    w: 1024,
    h: 1024,
    transparent: true,
    svg: svg(1024, 1024, ring({ cx: 512, cy: 512, outer: 300, color: WHITE })),
  },
  {
    file: 'favicon',
    w: 196,
    h: 196,
    svg: svg(196, 196, ring({ cx: 98, cy: 98, outer: 64, color: WHITE }), OXBLOOD),
  },
  {
    // Google Play feature graphic (1024×500): the name in the display face, uppercase, beside the O.
    file: 'store/feature-graphic',
    w: 1024,
    h: 500,
    svg: svg(
      1024,
      500,
      `<style>@font-face{font-family:Anton;src:url(data:font/ttf;base64,${anton}) format('truetype');}</style>` +
        ring({ cx: 780, cy: 250, outer: 150, color: WHITE }) +
        `<text x="96" y="318" font-family="Anton" font-size="176" letter-spacing="10" fill="${WHITE}">OJORO</text>`,
      OXBLOOD,
    ),
    // The embedded font makes this SVG large; only the PNG is kept.
    keepSvg: false,
  },
];

mkdirSync(join(out, 'brand'), { recursive: true });
mkdirSync(join(out, 'store'), { recursive: true });

const browser = await chromium.launch();
try {
  for (const a of assets) {
    const page = await browser.newPage({ viewport: { width: a.w, height: a.h }, deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style></head><body>${a.svg}</body></html>`,
    );
    await page.evaluate('document.fonts.ready');
    const png = await page.screenshot({ omitBackground: !!a.transparent, type: 'png' });
    writeFileSync(join(out, `${a.file}.png`), png);
    if (a.keepSvg !== false) writeFileSync(join(out, 'brand', `${a.file}.svg`), a.svg);
    await page.close();
    console.log(`wrote assets/${a.file}.png (${a.w}×${a.h})`);
  }
} finally {
  await browser.close();
}
