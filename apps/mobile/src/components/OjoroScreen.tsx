import type { PropsWithChildren } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/theme/tokens';

type OjoroScreenProps = PropsWithChildren<{
  eyebrow?: string;
  title: string;
  description?: string;
}>;

export function OjoroScreen({
  eyebrow,
  title,
  description,
  children,
}: OjoroScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.white,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  eyebrow: {
    color: colors.maroon,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.black,
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: -1.8,
    lineHeight: 44,
  },
  description: {
    color: colors.charcoal,
    fontSize: 17,
    lineHeight: 24,
  },
});
