/**
 * Pure rules for `FeedEnd`, the end-of-feed marker (Main's YOU'RE CAUGHT UP.,
 * FirstHome's THAT'S EVERYTHING.). Feeds are finite (SCREENS.md, Main).
 * No React Native imports, so it runs in Node.
 */

export const FEED_END_SIZES = ['md', 'sm'] as const;
export type FeedEndSize = (typeof FEED_END_SIZES)[number];

export type FeedEndLayout = {
  /** The O, pt. */
  mark: number;
  /** Gap between O, title and message, pt. */
  gap: number;
  /** Space above the O, pt. */
  paddingTop: number;
  message: 'body' | 'body-sm';
};

/**
 * From the prototypes: `md` is Main (48pt O, 12 gap, 16 above, `body`);
 * `sm` is FirstHome (40pt O, 8 gap, `body-sm`).
 */
export function feedEndLayout(size: FeedEndSize = 'md'): FeedEndLayout {
  return size === 'sm'
    ? { mark: 40, gap: 8, paddingTop: 0, message: 'body-sm' }
    : { mark: 48, gap: 12, paddingTop: 16, message: 'body' };
}
