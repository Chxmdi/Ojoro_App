import { View } from 'react-native';

import { useThemeColor } from '../useThemeColor';
import { quoted, quoteLayout, type QuoteVariant } from './Quote.logic';
import { Text } from './Text';

export { QUOTE_VARIANTS, quoted, type QuoteVariant } from './Quote.logic';

export type QuoteProps = {
  /** The person's own words. Curly quotes are added unless already there. */
  children: string;
  /** Who said it, and the context: "Marcus T · 12 games together · rivalry 3–4". */
  attribution?: string | undefined;
  /**
   * `note` (default): a request note, `body` beside a 2px `line-strong` bar
   * (`.req-note`, HostRequests). `callout`: the Call Out message, `title`
   * beside a 4px `text` bar, words 16pt in, 16pt above and below (CallOut).
   */
  variant?: QuoteVariant | undefined;
  testID?: string | undefined;
};

/**
 * A quote block: someone's words set off by a bar on the left, never a box
 * or a shadow. Reads as one item: the words, then the attribution.
 */
export function Quote({ children, attribution, variant = 'note', testID }: QuoteProps) {
  const layout = quoteLayout(variant);
  const bar = useThemeColor(layout.barColor);
  const words = quoted(children);
  return (
    <View
      accessible
      accessibilityLabel={[words, attribution].filter(Boolean).join(', ')}
      testID={testID}
      style={{
        borderLeftWidth: layout.barWidth,
        borderLeftColor: bar,
        paddingLeft: layout.paddingLeft,
        paddingVertical: layout.paddingY,
        gap: layout.gap,
      }}
    >
      <Text variant={layout.textVariant}>{words}</Text>
      {attribution ? (
        <Text variant="caption" muted>
          {attribution}
        </Text>
      ) : null}
    </View>
  );
}
