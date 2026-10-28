import { useCallback, useState, type ReactNode } from 'react';
import type { LayoutChangeEvent } from 'react-native';

import { posterHeroSize } from './posterHero';
import { Text, type TextProps } from './Text';

export type DisplaySize = 'hero' | 'xl' | 'lg' | 'md' | 'sm' | 'xs';

export type DisplayTextProps = Omit<TextProps, 'variant' | 'tone' | 'children'> & {
  /** Default `lg`. At most one `hero` per screen; never below `xs` (24px). */
  size?: DisplaySize;
  muted?: boolean;
  /**
   * Poster hero sizing (DESIGN_SYSTEM_PORT §3). On the web, a hero inside a
   * poster is `clamp(64px, 29cqi, 120px)`. Pass the poster's content width
   * (inside its padding, from `usePosterWidth`) and a `hero` sizes itself to
   * it. Ignored for other sizes. Opt-in so a hero outside a poster stays 120.
   */
  posterWidth?: number | undefined;
  children?: ReactNode;
};

/**
 * Uppercase display type in the condensed face. Always a heading for screen
 * readers (`role="heading"` replaces the web `as="h2"`; levels aren't needed
 * in RN). Pair it with a body line underneath. Scales with dynamic type up to
 * 1.3× and wraps, never truncates (see Text).
 */
export function DisplayText({ size = 'lg', muted, posterWidth, style, ...rest }: DisplayTextProps) {
  const poster = size === 'hero' && posterWidth !== undefined ? posterHeroSize(posterWidth) : null;
  return (
    <Text
      variant={`display-${size}`}
      muted={muted === true}
      role="heading"
      style={poster ? [poster, style] : style}
      {...rest}
    />
  );
}

/**
 * Measures a poster for its hero: attach `onLayout` to the view that holds the
 * poster's content (inside the padding) and pass `width` to
 * `<DisplayText size="hero" posterWidth={width}>`. `width` is undefined until
 * the first layout, so the first frame uses the token size.
 */
export function usePosterWidth(): [number | undefined, (e: LayoutChangeEvent) => void] {
  const [width, setWidth] = useState<number>();
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.width;
    setWidth((prev) => (prev === next ? prev : next));
  }, []);
  return [width, onLayout];
}
