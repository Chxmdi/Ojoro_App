import { spacing } from '@ojoro/design-tokens';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

export type ChipRowProps = {
  /** Names the group for screen readers: "Filter", "Quick Down For". */
  label: string;
  /**
   * `scroll` (default): one line that overflows on purpose and scrolls sideways
   * (Discover's filters, Pulse). `wrap`: chips wrap onto more lines
   * (FirstHome's quick Down For).
   */
  layout?: 'scroll' | 'wrap' | undefined;
  /**
   * Scroll only: how far the row runs past the right edge of its container, pt,
   * so a chip is cut by the screen edge rather than the gutter (the
   * prototype's `margin-right: -20px; padding-right: 20px`). Default `space-5`.
   * Pass 0 when the row already reaches the screen edge.
   */
  bleed?: number | undefined;
  /** `Chip`s. */
  children?: ReactNode;
  testID?: string | undefined;
};

const CHIP_GAP = spacing['space-2'];

/**
 * A group of chips, 8pt apart. Chips never shrink or wrap their label, so a
 * scrolling row cuts the last chip at the screen edge as a cue that there's
 * more (SCREENS.md, Discover).
 */
export function ChipRow({
  label,
  layout = 'scroll',
  bleed = spacing['space-5'],
  children,
  testID,
}: ChipRowProps) {
  if (layout === 'wrap') {
    return (
      <View
        role="group"
        aria-label={label}
        testID={testID}
        className="flex-row flex-wrap"
        style={{ gap: CHIP_GAP }}
      >
        {children}
      </View>
    );
  }
  return (
    <ScrollView
      horizontal
      role="group"
      aria-label={label}
      testID={testID}
      showsHorizontalScrollIndicator={false}
      style={{ marginRight: -bleed, flexGrow: 0 }}
      contentContainerStyle={{ gap: CHIP_GAP, paddingRight: bleed }}
    >
      {children}
    </ScrollView>
  );
}
