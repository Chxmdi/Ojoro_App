import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  type ViewStyle,
} from 'react-native';

import { colors, radius, spacing } from '@/theme/tokens';

type Variant = 'primary' | 'dark' | 'secondary' | 'ghost';

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  icon?: ReactNode;
  accessibilityHint?: string;
  style?: ViewStyle;
};

export function ActionButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  icon,
  accessibilityHint,
  style,
}: ActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      {icon}
      <Text
        style={[
          styles.label,
          variant === 'secondary' || variant === 'ghost'
            ? styles.darkLabel
            : styles.lightLabel,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  primary: { backgroundColor: colors.maroon },
  dark: { backgroundColor: colors.black },
  secondary: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
  },
  ghost: { backgroundColor: 'transparent' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.4 },
  label: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  lightLabel: { color: colors.white },
  darkLabel: { color: colors.black },
});
