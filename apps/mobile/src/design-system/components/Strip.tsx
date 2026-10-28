import { Link, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View, type GestureResponderEvent, type ViewProps } from 'react-native';

import { useThemeColor } from '../useThemeColor';
import { Icon } from './Icon';
import { FocusRing, useFocusVisible } from './pressFeedback';
import {
  STRIP_LEADING_WIDTH,
  stripAccessibilityLabel,
  stripLayout,
  textOf,
  type StripTitleVariant,
} from './Strip.logic';
import { Text } from './Text';

export { STRIP_TITLE_VARIANTS, type StripTitleVariant } from './Strip.logic';

export type StripProps = {
  /**
   * The leading time or numeral column (72pt): a string is set in `display-xs`
   * with tabular numerals ("SAT", "7:30", "140", "2–1"); a node is placed as is
   * (a day over a date caption, say). Leave out for rows without one.
   */
  leading?: ReactNode;
  /** How the leading column reads aloud when it isn't a string ("Thursday 14 March"). */
  leadingLabel?: string | undefined;
  title: string;
  /** `title` (default, the feed) · `title-sm` (settings, host lists) · `display-xs` / `display-sm` (menus). */
  titleVariant?: StripTitleVariant;
  /** The muted line under the title (`body-sm`). Wraps; never truncates. */
  meta?: string | undefined;
  /** `'chevron'` for the forward icon, or any node (a `Badge`, a `LiveIndicator`, a TextButton). */
  trailing?: 'chevron' | ReactNode;
  /** How the trailing slot reads aloud. Defaults to the words inside it (a Badge's label). */
  trailingLabel?: string | undefined;
  /** Opens a route (Expo Router `<Link asChild>`). */
  href?: Href | undefined;
  onPress?: ((event: GestureResponderEvent) => void) | undefined;
  /** The `line` hairline under the row. Default true: every strip has one, the last included. */
  rule?: boolean;
  /** Overrides the label read from leading, title, meta and trailing in visual order. */
  accessibilityLabel?: string | undefined;
  /** For a pressable strip: what happens ("Opens the plan"). */
  accessibilityHint?: string | undefined;
  testID?: string | undefined;
};

/**
 * The strip row (`oj-strip`): time/numeral column · title + meta · trailing
 * badge or chevron, separated by `line` hairlines. At least 44pt tall. With
 * `href` or `onPress` it's one pressable target; the screen reader reads the
 * row as one item, in visual order.
 *
 * Hairlines: each strip draws its own rule along its bottom edge, the last one
 * included, and none on top (the section's `Divider` sits above the first
 * row), exactly as `.oj-strip { border-bottom }`. Stack strips with no gap,
 * or use `StripList`.
 */
export function Strip({
  leading,
  leadingLabel,
  title,
  titleVariant = 'title',
  meta,
  trailing,
  trailingLabel,
  href,
  onPress,
  rule = true,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: StripProps) {
  const text = useThemeColor('text');
  const pressedGround = useThemeColor('surface-raised');
  const hasLeading = leading != null && leading !== false && leading !== '';
  const layout = stripLayout({ hasLeading, titleVariant });
  const leadingIsText = typeof leading === 'string' || typeof leading === 'number';
  const label =
    accessibilityLabel ??
    stripAccessibilityLabel([
      leadingLabel ?? (hasLeading ? textOf(leading) : undefined),
      title,
      meta,
      trailing === 'chevron' ? undefined : (trailingLabel ?? textOf(trailing)),
    ]);
  const focus = useFocusVisible({});

  const row = (
    <>
      {hasLeading ? (
        <View style={{ width: STRIP_LEADING_WIDTH }} className="shrink-0">
          {leadingIsText ? (
            <Text variant="display-xs" style={{ fontVariant: ['tabular-nums'] }}>
              {leading}
            </Text>
          ) : (
            leading
          )}
        </View>
      ) : null}
      <View className="min-w-0 flex-1" style={{ gap: layout.bodyGap }}>
        <Text variant={titleVariant}>{title}</Text>
        {meta ? (
          <Text variant="body-sm" muted>
            {meta}
          </Text>
        ) : null}
      </View>
      {trailing === 'chevron' ? (
        <Icon name="forward" color={text} />
      ) : trailing != null && trailing !== false ? (
        <View className="shrink-0">{trailing}</View>
      ) : null}
    </>
  );

  const rowClass = [
    'relative min-h-touch flex-row items-center',
    rule ? 'border-b border-line' : null,
  ]
    .filter(Boolean)
    .join(' ');
  const rowStyle = { paddingVertical: layout.paddingY, gap: layout.gap };

  if (!href && !onPress) {
    const props: ViewProps = { accessible: true, accessibilityLabel: label };
    return (
      <View className={rowClass} style={rowStyle} testID={testID} {...props}>
        {row}
      </View>
    );
  }

  const pressable = (
    <Pressable
      onPress={onPress}
      onPressIn={focus.onPressIn}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      accessibilityRole={href ? 'link' : 'button'}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      testID={testID}
      className={rowClass}
      // Pressed: a ground change (surface-raised), not a shadow or ripple.
      style={({ pressed }) => [rowStyle, pressed ? { backgroundColor: pressedGround } : null]}
    >
      {row}
      {focus.focusVisible ? <FocusRing shape="square" /> : null}
    </Pressable>
  );

  return href ? (
    <Link href={href} asChild>
      {pressable}
    </Link>
  ) : (
    pressable
  );
}

/** Strips as children. Each draws its own bottom hairline; the list adds no top rule and no gaps. */
export type StripListProps = ViewProps;

/** A run of strips with no gaps between rows, read as a list. */
export function StripList(props: StripListProps) {
  return <View role="list" {...props} />;
}
