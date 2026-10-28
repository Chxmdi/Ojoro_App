/**
 * Shared plumbing for Sheet and Modal (not exported from the design system):
 * the one-overlay-at-a-time slot, enter/exit presence with reduced motion,
 * the scrim, and moving screen-reader / keyboard focus.
 */
import { brand, opacity } from '@ojoro/design-tokens';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { motion, REDUCED_MOTION_FADE } from '../motion';
import { Icon } from './Icon';
import { overlayGate } from './Overlay.logic';
import { FocusRing, useFocusVisible, usePressScale } from './pressFeedback';

export type Timing = { duration: number; easing: (typeof motion)['commit']['easing'] };

/** Under reduced motion every overlay cross-fades in at most 120ms instead of moving. */
const REDUCED_FADE = {
  duration: REDUCED_MOTION_FADE,
  easing: Easing.linear,
  // Reanimated would otherwise skip the timing entirely; the spec wants a short fade.
  reduceMotion: ReduceMotion.Never,
} as const;

/**
 * Stories only: force the reduced-motion path for overlays and toasts inside,
 * whatever the system setting says. `null` (the default) follows the system.
 */
export const ReducedMotionOverride = createContext<boolean | null>(null);

/** The system's reduce-motion setting, unless a story overrides it. */
export function useOverlayReducedMotion(): boolean {
  const system = useReducedMotion();
  return useContext(ReducedMotionOverride) ?? system;
}

/**
 * Keeps an overlay mounted while it animates out, holds the overlay slot while
 * mounted, and runs `progress` 0 → 1 on enter and back on exit.
 * `ready` lets the caller hold the enter animation (Sheet waits to measure itself).
 */
export function useOverlayPresence(
  visible: boolean,
  enter: Timing,
  exit: Timing,
  ready = true,
): { shown: boolean; progress: SharedValue<number>; reduced: boolean } {
  const reduced = useOverlayReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);
  const allowed = useOverlaySlot(mounted);

  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (!mounted) return;
    if (visible) {
      if (allowed && ready)
        progress.value = withTiming(1, reduced ? REDUCED_FADE : { ...enter, reduceMotion: ReduceMotion.Never });
      return;
    }
    progress.value = withTiming(
      0,
      reduced ? REDUCED_FADE : { ...exit, reduceMotion: ReduceMotion.Never },
      (finished) => {
        if (finished) scheduleOnRN(setMounted, false);
      },
    );
  }, [visible, mounted, allowed, ready, reduced, enter, exit, progress]);

  return { shown: mounted && allowed, progress, reduced };
}

/** Asks the app-wide gate for the screen while `wanted`; true once this overlay holds it. */
function useOverlaySlot(wanted: boolean): boolean {
  const id = useId();
  const active = useSyncExternalStore(overlayGate.subscribe, overlayGate.active, overlayGate.active);
  useEffect(() => {
    if (!wanted) return;
    overlayGate.request(id);
    return () => overlayGate.release(id);
  }, [wanted, id]);
  return wanted && active === id;
}

/** The `opacity-scrim` black behind every overlay. Hidden from screen readers. */
export function Scrim({
  progress,
  onPress,
}: {
  progress: SharedValue<number>;
  onPress?: (() => void) | undefined;
}) {
  const style = useAnimatedStyle(() => ({ opacity: progress.value * opacity['opacity-scrim'] }));
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { backgroundColor: brand['brand-black'] }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      {...(Platform.OS === 'web' ? { 'aria-hidden': true } : null)}
    >
      {onPress ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onPress}
          accessible={false}
          focusable={false}
          {...(Platform.OS === 'web' ? { tabIndex: -1 } : null)}
        />
      ) : null}
    </Animated.View>
  );
}

/**
 * Moves screen-reader focus (native) or keyboard focus (web) to `ref`.
 * On web the target needs `tabIndex={-1}` if it isn't focusable on its own.
 */
export function moveFocus(ref: RefObject<unknown>) {
  const node = ref.current;
  if (!node) return;
  if (Platform.OS === 'web') {
    (node as { focus?: () => void }).focus?.();
    return;
  }
  AccessibilityInfo.sendAccessibilityEvent(
    node as Parameters<typeof AccessibilityInfo.sendAccessibilityEvent>[0],
    'focus',
  );
}

/**
 * Web only: remembers what had focus when the overlay opened and gives focus
 * back to it when the overlay closes (the trigger, usually).
 */
export function useReturnFocus(shown: boolean) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !shown || typeof document === 'undefined') return;
    const trigger = document.activeElement as { focus?: () => void } | null;
    return () => trigger?.focus?.();
  }, [shown]);
}

/** `tabIndex={-1}` on web so a heading can take programmatic focus; nothing on native. */
export const programmaticFocus = Platform.OS === 'web' ? ({ tabIndex: -1 } as object) : null;

/**
 * The sheet's close control: a 44pt round hit area with the close icon,
 * labelled "Close" (the web reference's IconButton icon="close").
 */
export function CloseButton({ onPress }: { onPress?: (() => void) | undefined }) {
  const press = usePressScale(ICON_PRESS_SCALE);
  const focus = useFocusVisible({});
  return (
    <Pressable
      role="button"
      accessibilityLabel="Close"
      hitSlop={0}
      onPress={onPress}
      onPressIn={(event) => {
        press.pressIn();
        focus.onPressIn(event);
      }}
      onPressOut={press.pressOut}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
    >
      <Animated.View style={press.style} className="size-touch items-center justify-center rounded-pill">
        <Icon name="close" />
        {focus.focusVisible ? <FocusRing /> : null}
      </Animated.View>
    </Pressable>
  );
}

/** `.oj-iconbtn:active` scale. */
const ICON_PRESS_SCALE = 0.92;
