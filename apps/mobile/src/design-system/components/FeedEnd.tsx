import type { ReactNode } from 'react';
import { View } from 'react-native';

import { feedEndLayout, type FeedEndSize } from './FeedEnd.logic';
import { Graphic } from './Graphic';
import { Text } from './Text';

export { FEED_END_SIZES, feedEndLayout, type FeedEndSize } from './FeedEnd.logic';

export type FeedEndProps = {
  /** The display line: YOU'RE CAUGHT UP. · THAT'S EVERYTHING. */
  title: string;
  /** The muted line under it, the next action in words ("Start something and it'll be here tomorrow."). */
  message?: string | undefined;
  /** `md` (Main, default) or `sm` (FirstHome). */
  size?: FeedEndSize | undefined;
  /** An action under the message, if the screen offers one. */
  children?: ReactNode;
  testID?: string | undefined;
};

/**
 * The end of a finite feed: the O, a `display-sm` line and a muted message,
 * centred. Feeds end; there is no infinite scroll. The O is decorative; the
 * title is a heading so screen-reader users can tell the feed is over.
 */
export function FeedEnd({ title, message, size = 'md', children, testID }: FeedEndProps) {
  const layout = feedEndLayout(size);
  return (
    <View
      testID={testID}
      role="region"
      aria-label="End of feed"
      className="items-center"
      style={{ gap: layout.gap, paddingTop: layout.paddingTop }}
    >
      <Graphic kind="o" size={layout.mark} />
      <Text variant="display-sm" role="heading" className="text-center">
        {title}
      </Text>
      {message ? (
        <Text variant={layout.message} muted className="text-center">
          {message}
        </Text>
      ) : null}
      {children}
    </View>
  );
}
