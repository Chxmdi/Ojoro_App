#!/usr/bin/env node
// Generates the design-token code from design-handoff/design-system/tokens.json.
//
//   node scripts/build-tokens.mjs          write the generated files
//   node scripts/build-tokens.mjs --check  fail if the generated files are stale
//
// Outputs:
//   packages/design-tokens/src/generated/tokens.ts  typed constants for code
//   apps/mobile/src/design-system/tokens.css        NativeWind (Tailwind v4) theme
//
// Never hand-edit the outputs. Change tokens.json (ask first) or this script.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = 'design-handoff/design-system/tokens.json';
const tokens = JSON.parse(readFileSync(resolve(root, source), 'utf8'));

const outTs = 'packages/design-tokens/src/generated/tokens.ts';
const outCss = 'apps/mobile/src/design-system/tokens.css';

// Text styles the web reference uses but tokens.json doesn't list
// (DESIGN_SYSTEM_PORT.md §1). Added to the UI group here.
const extraUiStyles = [
  { name: 'title-sm', fontSize: '15px', lineHeight: '20px', fontWeight: 600 },
  { name: 'label-sm', fontSize: '11px', lineHeight: '14px', fontWeight: 700, letterSpacing: '0.1em', uppercase: true },
  { name: 'overline', fontSize: '13px', lineHeight: '16px', fontWeight: 700, letterSpacing: '0.08em', uppercase: true, muted: true },
];

const px = (value) => {
  const match = /^(-?[\d.]+)px$/.exec(String(value).trim());
  if (!match) throw new Error(`Expected a px value, got ${value}`);
  return Number(match[1]);
};
const ms = (value) => {
  const match = /^([\d.]+)ms$/.exec(String(value).trim());
  if (!match) throw new Error(`Expected a ms value, got ${value}`);
  return Number(match[1]);
};
const round = (n) => Math.round(n * 1000) / 1000;

// Colour ---------------------------------------------------------------

const situationIds = tokens.color.themes.map((theme) => theme.id);
const brand = {};
const semantic = {};
for (const token of tokens.color.tokens) {
  if (token.name.startsWith('brand-')) brand[token.name] = token.value.toLowerCase();
  else semantic[token.name] = token.value;
}

const resolveColor = (value) => {
  const ref = /^\{(.+)\}$/.exec(value);
  if (!ref) return value.toLowerCase();
  const target = brand[ref[1]];
  if (!target) throw new Error(`Unknown colour reference ${value}`);
  return target;
};

const situations = Object.fromEntries(
  situationIds.map((id) => [
    id,
    Object.fromEntries(
      Object.entries(semantic).map(([name, perSituation]) => {
        if (!(id in perSituation)) throw new Error(`${name} has no value for ${id}`);
        return [name, resolveColor(perSituation[id])];
      }),
    ),
  ]),
);

// Type -----------------------------------------------------------------

const textStyles = {};
for (const group of tokens.type.groups) {
  const styles = group.family === 'ui' ? [...group.styles, ...extraUiStyles] : group.styles;
  for (const style of styles) {
    const fontSize = px(style.fontSize);
    const lineHeight =
      typeof style.lineHeight === 'number' ? round(fontSize * style.lineHeight) : px(style.lineHeight);
    const letterSpacing = style.letterSpacing ? round(fontSize * parseFloat(style.letterSpacing)) : 0;
    textStyles[style.name] = {
      family: group.family,
      fontSize,
      lineHeight,
      fontWeight: style.fontWeight,
      letterSpacing,
      uppercase: group.family === 'display' || style.name === 'label' || Boolean(style.uppercase),
      muted: Boolean(style.muted),
      tabular: style.name === 'numeric',
    };
  }
}

// Scales ---------------------------------------------------------------

const scale = (group, parse) =>
  Object.fromEntries(tokens[group].tokens.map((token) => [token.name, parse(token.value)]));

const spacing = scale('spacing', px);
const radius = Object.fromEntries(
  tokens.radius.tokens.map((token) => [
    token.name,
    token.value === '0' ? 0 : token.value.endsWith('%') ? token.value : px(token.value),
  ]),
);
const size = scale('size', px);
const borderWidth = scale('borderWidth', px);
const opacity = scale('opacity', Number);
const duration = scale('duration', ms);
const easing = scale('easing', (value) => {
  const match = /^cubic-bezier\(([^)]+)\)$/.exec(value);
  if (!match) throw new Error(`Expected cubic-bezier, got ${value}`);
  return match[1].split(',').map(Number);
});
const shadowSheet = tokens.shadow.tokens.find((token) => token.name === 'shadow-sheet');
const shadow = (() => {
  const match = /^0 (-?\d+)px (\d+)px rgba\(0,\s*0,\s*0,\s*([\d.]+)\)$/.exec(shadowSheet.value);
  if (!match) throw new Error(`Unexpected shadow-sheet ${shadowSheet.value}`);
  return {
    'shadow-sheet': {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: Number(match[1]) },
      shadowRadius: Number(match[2]) / 2,
      shadowOpacity: Number(match[3]),
      elevation: 16,
    },
  };
})();

// TypeScript output ----------------------------------------------------

const header = `// Generated by scripts/build-tokens.mjs from ${source}. Do not edit.\n`;
const constant = (name, value) => `export const ${name} = ${JSON.stringify(value, null, 2)} as const;\n`;

const ts = [
  header,
  constant('tokenSetVersion', tokens.version),
  constant('situationIds', situationIds),
  constant('brand', brand),
  constant('situations', situations),
  constant('textStyles', textStyles),
  constant('spacing', spacing),
  constant('radius', radius),
  constant('size', size),
  constant('borderWidth', borderWidth),
  constant('opacity', opacity),
  constant('duration', duration),
  constant('easing', easing),
  constant('shadow', shadow),
].join('\n');

// CSS output -----------------------------------------------------------

const cssLines = [
  `/* Generated by scripts/build-tokens.mjs from ${source}. Do not edit. */`,
  '',
  '/* Semantic colours read the situation variables, so <Situation> re-themes a subtree. */',
  '@theme inline {',
  '  /* Six colours only: drop Tailwind\'s default palette so bg-red-500 and friends do not exist. */',
  '  --color-*: initial;',
  ...Object.keys(semantic).map((name) => `  --color-${name}: var(--${name});`),
  ...Object.entries(brand).map(([name, value]) => `  --color-${name}: ${value};`),
  '}',
  '',
  '@theme {',
  ...Object.entries(spacing).map(([name, value]) => `  --spacing-${name}: ${value}px;`),
  ...Object.entries(size).map(([name, value]) => `  --spacing-${name.replace(/^size-/, '')}: ${value}px;`),
  ...Object.entries(radius).map(
    ([name, value]) => `  --radius-${name.replace(/^radius-/, '')}: ${typeof value === 'number' ? `${value}px` : value};`,
  ),
  '}',
  '',
  '/* Default situation (calm) for anything outside a <Situation>. */',
  ':root {',
  ...Object.entries(situations.calm).map(([name, value]) => `  --${name}: ${value};`),
  '}',
  '',
];

const outputs = [
  [outTs, ts],
  [outCss, cssLines.join('\n')],
];

const check = process.argv.includes('--check');
let stale = false;
for (const [path, content] of outputs) {
  const absolute = resolve(root, path);
  if (check) {
    let current = '';
    try {
      current = readFileSync(absolute, 'utf8');
    } catch {
      // missing counts as stale
    }
    if (current !== content) {
      console.error(`${path} is out of date. Run: pnpm tokens`);
      stale = true;
    }
  } else {
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
    process.stdout.write(`Wrote ${path}\n`);
  }
}
if (stale) process.exit(1);
if (check) process.stdout.write('Design tokens are up to date.\n');
