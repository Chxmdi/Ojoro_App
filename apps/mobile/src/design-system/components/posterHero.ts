import { textStyles } from '@ojoro/design-tokens';

/** Bounds of the poster hero, from bundle.css: `clamp(64px, 29cqi, 120px)`. */
export const POSTER_HERO_MIN = 64;
export const POSTER_HERO_MAX = textStyles['display-hero'].fontSize;
export const POSTER_HERO_RATIO = 0.29;

const hero = textStyles['display-hero'];

/**
 * Font metrics for `display-hero` inside a poster, sized to the poster so the
 * headline never overflows a phone. `width` is the poster's content width
 * (inside its padding): on the web, `cqi` is 1% of the container's content box.
 * Line height and letter spacing keep the token's ratios (0.88, 0.005em).
 */
export function posterHeroSize(width: number): {
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
} {
  const raw = Number.isFinite(width) ? width * POSTER_HERO_RATIO : POSTER_HERO_MAX;
  const fontSize = Math.min(POSTER_HERO_MAX, Math.max(POSTER_HERO_MIN, raw));
  return {
    fontSize,
    lineHeight: fontSize * (hero.lineHeight / hero.fontSize),
    letterSpacing: fontSize * (hero.letterSpacing / hero.fontSize),
  };
}
