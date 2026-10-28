/**
 * Pure rules for `Image` (design-system/components/Image.md and the web
 * reference `OjImage` / `.oj-image*`). No React Native imports, so it runs in Node.
 */

export const IMAGE_RATIOS = ['4:5', '1:1', '16:9', '3:4'] as const;
export type ImageRatio = (typeof IMAGE_RATIOS)[number];

/** `4:5` (feed default) → 0.8, as a width / height number for RN's `aspectRatio`. */
export function aspectRatioOf(ratio: ImageRatio = '4:5'): number {
  const [w, h] = ratio.split(':').map(Number) as [number, number];
  return w / h;
}

export type ImageStatus = 'loading' | 'loaded' | 'error';

export type ImagePresentation = {
  /** Mount the photo (it sits over the sunk ground while it loads). */
  photo: boolean;
  /** Show the placeholder: the O and, unless an overlay covers it, the alt in words. */
  placeholder: boolean;
  /** The alt as visible words inside the placeholder. */
  altInWords: boolean;
};

/**
 * What the frame shows. Loading is the plain `surface-sunk` ground under the
 * photo; a missing or failed photo is the ground with the O and the alt in
 * words, never a broken-image icon. With an overlay (display type on a scrim)
 * the overlay carries the words, so the alt isn't repeated on screen; it stays
 * the accessibility label.
 */
export function imagePresentation(
  src: string | undefined,
  status: ImageStatus,
  hasOverlay = false,
): ImagePresentation {
  const failed = !src || status === 'error';
  return { photo: !failed, placeholder: failed, altInWords: failed && !hasOverlay };
}

/** The figcaption line: "caption · credit". Null when there's neither. */
export function captionLine(caption?: string, credit?: string): string | null {
  const parts = [caption, credit].filter((part): part is string => Boolean(part?.trim()));
  return parts.length ? parts.join(' · ') : null;
}
