import { brand, opacity } from '@ojoro/design-tokens';
import { Pressable, View, type TextStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { uiFamily } from '../fonts';
import { useThemeColor } from '../useThemeColor';
import { formatCount } from './formatCount';
import { Icon, type IconName } from './Icon';
import { FocusRing, useFocusVisible, usePressScale } from './pressFeedback';
import { Text } from './Text';

export type IconButtonVariant = 'plain' | 'outline' | 'solid';

export type IconButtonProps = {
  icon: IconName;
  /**
   * Required: the accessible name (`aria-label` on the web). Include the count
   * when there is one ("Activity chat, 3 new"); the badge itself is hidden.
   */
  label: string;
  /** `plain` (headers) · `outline` (on content) · `solid` (the one create action in a header). Default `plain`. */
  variant?: IconButtonVariant;
  /** Notification count. Shows 1–9, then 9+. Nothing at 0. */
  count?: number;
  disabled?: boolean;
  onPress?: () => void;
  /** Layout classes for the outer box. */
  className?: string;
  testID?: string;
};

/** Press compresses to 0.92 (IconButton.md). */
const ICON_BUTTON_SCALE = 0.92;

const surfaceClass: Record<IconButtonVariant, string> = {
  plain: 'border-transparent bg-transparent',
  outline: 'border-line-strong bg-transparent',
  solid: 'border-transparent bg-inverse',
};

/**
 * `.oj-iconbtn-count`: 18px oxblood pill, 10/18 Inter 700, white, with a 2px
 * `mark-ring` outside it (the web draws it with box-shadow). RN draws the ring
 * as a 2px border on a 22px box, so the oxblood inside stays 18px.
 */
const COUNT_RING = 2;
/** The web positions the badge inside the button's 1px border (CSS absolute offsets start at the padding edge). */
const HAIR = 1;
const countText: TextStyle = {
  fontFamily: uiFamily(700),
  fontSize: 10,
  lineHeight: 18,
  letterSpacing: 0,
  color: brand['brand-white'],
  textAlign: 'center',
  fontVariant: ['tabular-nums'],
};

/**
 * A round 44pt button holding one icon, for navigation and secondary actions.
 * Never for I'M DOWN or any commitment: those are words.
 */
export function IconButton({
  icon,
  label,
  variant = 'plain',
  count,
  disabled = false,
  onPress,
  className,
  testID,
}: IconButtonProps) {
  const onInverse = useThemeColor('on-inverse');
  const press = usePressScale(ICON_BUTTON_SCALE);
  const focus = useFocusVisible({});
  const badge = formatCount(count);

  return (
    <Pressable
      role="button"
      aria-label={label}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onPress={onPress}
      onPressIn={(event) => {
        press.pressIn();
        focus.onPressIn(event);
      }}
      onPressOut={press.pressOut}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      testID={testID}
      className={['self-start', className].filter(Boolean).join(' ')}
      style={disabled ? { opacity: opacity['opacity-disabled'] } : undefined}
    >
      <Animated.View style={press.style}>
        <View
          className={`h-touch w-touch items-center justify-center rounded-pill border ${surfaceClass[variant]}`}
        >
          <Icon name={icon} {...(variant === 'solid' ? { color: onInverse } : null)} />
        </View>
        {badge ? (
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            aria-hidden
            className="absolute rounded-pill border-mark-ring"
            style={{
              top: HAIR + 4 - COUNT_RING,
              right: HAIR + 2 - COUNT_RING,
              minWidth: 18 + COUNT_RING * 2,
              height: 18 + COUNT_RING * 2,
              paddingHorizontal: 4,
              borderWidth: COUNT_RING,
              backgroundColor: brand['brand-oxblood'],
            }}
          >
            <Text variant="label-sm" style={countText} maxFontSizeMultiplier={1}>
              {badge}
            </Text>
          </View>
        ) : null}
        {focus.focusVisible ? <FocusRing /> : null}
      </Animated.View>
    </Pressable>
  );
}
