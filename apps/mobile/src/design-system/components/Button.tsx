import { opacity, spacing } from '@ojoro/design-tokens';
import { Link, type Href } from 'expo-router';
import { useEffect, useRef, type ReactNode, type Ref } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  View,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { DISPLAY_FAMILY } from '../fonts';
import { haptics } from '../haptics';
import { COMMIT_SCALE, REDUCED_MOTION_FADE } from '../motion';
import { useThemeColor } from '../useThemeColor';
import {
  Check,
  FocusRing,
  useFocusVisible,
  usePressScale,
  noBrowserOutline,
} from './pressFeedback';
import { Text, type TextTone } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'inverse' | 'commit';

export type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  /** `primary` (signal fill, one per view) · `secondary` · `ghost` · `inverse` · `commit` (I'M DOWN). Default `primary`. */
  variant?: ButtonVariant;
  /** Commit only: the label locks to YOU'RE DOWN with a check, on an outlined ground. */
  committed?: boolean;
  /** Full width. */
  block?: boolean;
  /** Keep the label, add a spinner, ignore presses. */
  loading?: boolean;
  /** Navigate with Expo Router instead of (or as well as) `onPress`. */
  href?: Href;
  /** The label. A string is set in the button's type; product verbs are written in caps. Commit defaults to I'M DOWN. */
  children?: ReactNode;
  /** Layout classes for the button's outer box (margins, alignment). */
  className?: string;
  style?: StyleProp<ViewStyle>;
  /** The pressable's view, e.g. to move accessibility focus to it (Modal focuses its safe option). */
  ref?: Ref<View> | undefined;
};

/** Check and label sit `space-2` apart, like the button's own gap. */
const labelRow: ViewStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: spacing['space-2'],
  flexShrink: 1,
};

const COMMIT_LABEL = "I'M DOWN";
const COMMITTED_LABEL = "YOU'RE DOWN";

/** Ground, border and padding per variant (`.oj-btn-*` in bundle.css). Every button has a 2px border. */
function surfaceClass(variant: ButtonVariant, committed: boolean): string {
  switch (variant) {
    case 'primary':
      return 'min-h-touch px-space-6 bg-signal border-transparent';
    case 'secondary':
      return 'min-h-touch px-space-6 bg-transparent border-line-strong';
    case 'ghost':
      return 'min-h-touch px-space-3 bg-transparent border-transparent';
    case 'inverse':
      return 'min-h-touch px-space-6 bg-inverse border-transparent';
    case 'commit':
      return committed
        ? 'min-h-commit px-space-8 bg-transparent border-text'
        : 'min-h-commit px-space-8 bg-signal border-transparent';
  }
}

function toneFor(variant: ButtonVariant, committed: boolean): TextTone {
  if (variant === 'primary') return 'on-signal';
  if (variant === 'inverse') return 'on-inverse';
  if (variant === 'commit') return committed ? 'text' : 'on-signal';
  return 'text';
}

/** `.oj-btn-commit`: display face 24px, 0.03em tracking. Line height opened up so Anton isn't clipped on Android. */
const commitLabelStyle: TextStyle = {
  fontFamily: DISPLAY_FAMILY,
  fontSize: 24,
  lineHeight: 28,
  letterSpacing: 0.72,
  textTransform: 'uppercase',
};

/**
 * `.oj-btn-ghost`: underlined, 4px under the text. Native text has no underline
 * offset, so the line sits at the font's default position there.
 */
const ghostLabelStyle = {
  textDecorationLine: 'underline',
  ...(Platform.OS === 'web' ? { textUnderlineOffset: 4 } : null),
} as TextStyle;

/**
 * Pill button for every action; `commit` is the I'M DOWN button.
 * Press compresses to 0.96 (`dur-commit`, `ease-commit`). Committing plays the
 * I'M DOWN haptic and the label locks to YOU'RE DOWN; the owner flips `committed`
 * in `onPress`. Under reduced motion nothing scales and the label cross-fades.
 */
export function Button({
  variant = 'primary',
  committed = false,
  block = false,
  loading = false,
  disabled,
  href,
  children,
  className,
  style,
  onPress,
  onPressIn,
  onPressOut,
  onFocus,
  onBlur,
  ref,
  ...rest
}: ButtonProps) {
  const isCommit = variant === 'commit';
  const isCommitted = isCommit && committed;
  const tone = toneFor(variant, isCommitted);
  const toneColour = useThemeColor(
    tone === 'on-signal' ? 'on-signal' : tone === 'on-inverse' ? 'on-inverse' : 'text',
  );
  const press = usePressScale(COMMIT_SCALE);
  const focus = useFocusVisible({ onPressIn, onFocus, onBlur });

  // Reduced motion: the label change is a cross-fade of at most 120ms instead of a lock.
  const labelOpacity = useSharedValue(1);
  const labelStyle = useAnimatedStyle(() => ({ opacity: labelOpacity.value }));
  const previous = useRef(isCommitted);
  useEffect(() => {
    if (previous.current === isCommitted) return;
    previous.current = isCommitted;
    if (press.reduced) {
      labelOpacity.value = 0;
      labelOpacity.value = withTiming(1, { duration: REDUCED_MOTION_FADE });
    }
  }, [isCommitted, labelOpacity, press.reduced]);

  const inactive = !!disabled || loading;

  const handlePress = (event: GestureResponderEvent) => {
    if (inactive) return;
    if (isCommit && !committed) void haptics.imDownAccepted();
    onPress?.(event);
  };

  const label = isCommit ? (isCommitted ? COMMITTED_LABEL : (children ?? COMMIT_LABEL)) : children;
  const labelNode =
    typeof label === 'string' || typeof label === 'number' ? (
      <Text
        variant="label"
        tone={tone}
        className="shrink text-center"
        style={isCommit ? commitLabelStyle : variant === 'ghost' ? ghostLabelStyle : undefined}
        {...(isCommit ? { maxFontSizeMultiplier: 1.3 } : null)}
      >
        {label}
      </Text>
    ) : (
      label
    );

  // Commit toggles pressed state. RN has no aria-pressed: selected on native, aria-pressed on web.
  const pressedState = isCommit
    ? Platform.OS === 'web'
      ? { 'aria-pressed': isCommitted }
      : { 'aria-selected': isCommitted }
    : null;

  const button = (
    <Pressable
      ref={ref}
      role={href ? 'link' : 'button'}
      aria-disabled={inactive || undefined}
      aria-busy={loading || undefined}
      {...pressedState}
      disabled={inactive}
      {...rest}
      onPress={handlePress}
      onPressIn={(event) => {
        press.pressIn();
        focus.onPressIn(event);
      }}
      onPressOut={(event) => {
        press.pressOut();
        onPressOut?.(event);
      }}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      className={[block ? 'self-stretch' : 'self-start', className].filter(Boolean).join(' ')}
      style={[
        noBrowserOutline,
        inactive && !loading ? { opacity: opacity['opacity-disabled'] } : null,
        style,
      ]}
    >
      <Animated.View style={press.style}>
        <View
          className={`flex-row items-center justify-center gap-space-2 rounded-pill border-2 py-space-2 ${surfaceClass(variant, isCommitted)}`}
        >
          {loading ? <ActivityIndicator size="small" color={toneColour} /> : null}
          <Animated.View style={[labelStyle, labelRow]}>
            {isCommitted ? <Check color={toneColour} /> : null}
            {labelNode}
          </Animated.View>
        </View>
        {focus.focusVisible ? <FocusRing /> : null}
      </Animated.View>
    </Pressable>
  );

  return href ? (
    <Link href={href} asChild>
      {button}
    </Link>
  ) : (
    button
  );
}
