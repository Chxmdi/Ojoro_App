import { useCallback, useState } from 'react';
import {
  Platform,
  View,
  type NativeSyntheticEvent,
  type GestureResponderEvent,
  type TargetedEvent,
  type ViewStyle,
} from 'react-native';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { useMotion } from '../motion';
import { useThemeColor } from '../useThemeColor';

/**
 * Shared press feedback for the pressable primitives (Button, IconButton,
 * TextButton, Chip): the commit-family press scale, the focus-visible ring and
 * the 16px check the web reference draws inside buttons, chips and badges.
 */

type PressHandler = ((event: GestureResponderEvent) => void) | null | undefined;
type FocusHandler = ((event: NativeSyntheticEvent<TargetedEvent>) => void) | null | undefined;

/**
 * Press compresses to `scale` over `dur-commit` with `ease-commit`, on the UI
 * thread. Under reduced motion it doesn't move at all.
 */
export function usePressScale(scale: number) {
  const { duration, easing, reduced } = useMotion('commit');
  const value = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: value.value }] }));
  const pressIn = useCallback(() => {
    if (!reduced) value.value = withTiming(scale, { duration, easing });
  }, [duration, easing, reduced, scale, value]);
  const pressOut = useCallback(() => {
    value.value = reduced ? 1 : withTiming(1, { duration, easing });
  }, [duration, easing, reduced, value]);
  return { style, pressIn, pressOut, reduced };
}

/**
 * Focus-visible: the ring shows when focus arrives from a keyboard or switch
 * control, not when a pointer pressed the control. On the web the browser's own
 * `:focus-visible` decides. On iOS and Android a touch never focuses a
 * Pressable, so any focus there comes from a keyboard or switch control.
 */
function isFocusVisible(event: NativeSyntheticEvent<TargetedEvent>): boolean {
  if (Platform.OS !== 'web') return true;
  const target = (event.nativeEvent as unknown as { target?: { matches?: (q: string) => boolean } })
    .target;
  try {
    return target?.matches?.(':focus-visible') ?? true;
  } catch {
    return true;
  }
}

export function useFocusVisible(handlers: {
  onPressIn?: PressHandler;
  onFocus?: FocusHandler;
  onBlur?: FocusHandler;
}) {
  const { onPressIn, onFocus, onBlur } = handlers;
  const [focusVisible, setFocusVisible] = useState(false);
  return {
    focusVisible,
    onPressIn: (event: GestureResponderEvent) => {
      onPressIn?.(event);
    },
    onFocus: (event: NativeSyntheticEvent<TargetedEvent>) => {
      setFocusVisible(isFocusVisible(event));
      onFocus?.(event);
    },
    onBlur: (event: NativeSyntheticEvent<TargetedEvent>) => {
      setFocusVisible(false);
      onBlur?.(event);
    },
  };
}

/**
 * The browser draws its own focus outline around the element; Ojoro draws
 * `FocusRing` instead, so turn the browser's off (web only).
 */
export const noBrowserOutline = (
  Platform.OS === 'web' ? { outlineStyle: 'none' } : null
) as ViewStyle | null;

/** Ring width (`border-strong`) plus its offset from the control's edge. */
const RING_OUTSET = 4;

/** The 2px `focus` ring, 2px outside the control. Put it inside the control's (relative) box. */
export function FocusRing({ shape = 'round' }: { shape?: 'round' | 'square' }) {
  const radius = shape === 'round' ? 'rounded-pill' : 'rounded-none';
  return (
    <View
      pointerEvents="none"
      className={`absolute border-2 border-focus ${radius}`}
      style={{ top: -RING_OUTSET, left: -RING_OUTSET, right: -RING_OUTSET, bottom: -RING_OUTSET }}
    />
  );
}

/** The web reference's `Check`: 16 box, 2.2 stroke, square caps. Hidden from screen readers. */
export function Check({ color, size = 16 }: { color?: string; size?: number }) {
  const text = useThemeColor('text');
  const hidden =
    Platform.OS === 'web'
      ? { 'aria-hidden': true }
      : {
          accessibilityElementsHidden: true,
          importantForAccessibility: 'no-hide-descendants' as const,
        };
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" {...hidden}>
      <Path
        d="M3 8.5 L6.5 12 L13 4.5"
        fill="none"
        stroke={color ?? text}
        strokeWidth={2.2}
        strokeLinecap="square"
      />
    </Svg>
  );
}
