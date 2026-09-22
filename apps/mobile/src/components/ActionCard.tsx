import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme/tokens';

type Props = PropsWithChildren<{
  eyebrow?: string;
  title: string;
  meta?: string;
  dark?: boolean;
}>;

export function ActionCard({
  eyebrow,
  title,
  meta,
  dark = false,
  children,
}: Props) {
  return (
    <View style={[styles.card, dark ? styles.dark : null]}>
      {eyebrow ? (
        <Text style={[styles.eyebrow, dark ? styles.darkMuted : null]}>
          {eyebrow}
        </Text>
      ) : null}
      <Text style={[styles.title, dark ? styles.darkText : null]}>{title}</Text>
      {meta ? (
        <Text style={[styles.meta, dark ? styles.darkMuted : null]}>{meta}</Text>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
  },
  dark: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  eyebrow: {
    color: colors.maroon,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.black,
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  meta: {
    color: colors.charcoal,
    fontSize: 14,
    lineHeight: 20,
  },
  darkText: { color: colors.white },
  darkMuted: { color: colors.taupe },
});
