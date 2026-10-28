/**
 * Pure rules for `Strip`, the `oj-strip` row pattern (DESIGN_SYSTEM_PORT.md §8;
 * `.oj-strip*` in bundle.css; ~58 uses in the prototype screens). No React
 * Native imports, so it runs in Node.
 */

/** Title styles the screens put in a strip body. */
export const STRIP_TITLE_VARIANTS = ['title', 'title-sm', 'display-xs', 'display-sm'] as const;
export type StripTitleVariant = (typeof STRIP_TITLE_VARIANTS)[number];

export type StripLayout = {
  /** Top and bottom padding, pt. */
  paddingY: number;
  /** Gap between the leading column, the body and the trailing slot, pt. */
  gap: number;
  /** Gap between title and meta, pt. */
  bodyGap: number;
};

/** Width of the leading time/numeral column (`.oj-strip-time`). */
export const STRIP_LEADING_WIDTH = 72;

/**
 * Spacing, from the screens:
 * - with a leading column: 12 padding, 16 gap (`.oj-strip`: Main, Discover, You, HostHome);
 * - without one: 12 gap (the inline `gap: 12px` on every leading-less strip that has a style);
 * - `display-sm` titles (Create's menu): 16 padding, 4 between title and meta;
 * - `display-xs` titles (HostHome's tools): 14 padding.
 */
export function stripLayout({
  hasLeading,
  titleVariant = 'title',
}: {
  hasLeading: boolean;
  titleVariant?: StripTitleVariant;
}): StripLayout {
  const gap = hasLeading ? 16 : 12;
  if (titleVariant === 'display-sm') return { paddingY: 16, gap, bodyGap: 4 };
  if (titleVariant === 'display-xs') return { paddingY: 14, gap, bodyGap: 0 };
  return { paddingY: 12, gap, bodyGap: 0 };
}

/**
 * The words in a React node: strings and numbers, through arrays and element
 * `props.children`. Used to read a trailing `<Badge>3 DAYS</Badge>` aloud.
 * Works on plain objects, so it needs no React import.
 */
export function textOf(node: unknown): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).filter(Boolean).join(' ');
  if (typeof node === 'object' && 'props' in node) {
    const props = (node as { props?: { children?: unknown } }).props;
    return textOf(props?.children);
  }
  return '';
}

/**
 * The row read in visual order: leading, title, meta, trailing, joined with
 * commas (as ActivityStrip's `aria-label` does). Empty parts are skipped.
 */
export function stripAccessibilityLabel(parts: readonly (string | null | undefined)[]): string {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
}
