export * from './generated/tokens';

import { situations, situationIds } from './generated/tokens';

export type SituationId = (typeof situationIds)[number];
export type ColorToken = keyof (typeof situations)['calm'];
export type TextStyleName = keyof typeof import('./generated/tokens').textStyles;

/** CSS variables for one situation, in the shape NativeWind's VariableContextProvider takes. */
export function situationVariables(id: SituationId): Record<`--${string}`, string> {
  return Object.fromEntries(
    Object.entries(situations[id]).map(([name, value]) => [`--${name}`, value]),
  ) as Record<`--${string}`, string>;
}

/** Parses #rrggbb or rgba(r,g,b,a) into 0–255 channels and alpha. */
export function parseColor(value: string): { r: number; g: number; b: number; a: number } {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex?.[1]) {
    const n = Number.parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(value);
  if (rgba?.[1]) {
    const [r = 0, g = 0, b = 0, a = 1] = rgba[1].split(',').map((part) => Number(part.trim()));
    return { r, g, b, a };
  }
  throw new Error(`Unsupported colour ${value}`);
}

function luminance(value: string): number {
  const { r, g, b } = parseColor(value);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2 contrast ratio between two opaque colours. */
export function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (lighter + 0.05) / (darker + 0.05);
}
