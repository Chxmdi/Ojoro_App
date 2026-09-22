import type { PropsWithChildren } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors, spacing, typeScale } from '@/theme/tokens';

type OjoroScreenProps = PropsWithChildren<{
  eyebrow?: string;
  title: string;
  description?: string;
  dark?: boolean;
  scroll?: boolean;
}>;

export function OjoroScreen({
  eyebrow,
  title,
  description,
  dark = false,
  scroll = true,
  children,
}: OjoroScreenProps) {
  const content = (
    <View style={styles.content}>
      {eyebrow ? (
        <Text style={[styles.eyebrow, dark ? styles.onDarkMuted : null]}>
          {eyebrow}
        </Text>
      ) : null}
      <Text style={[styles.title, dark ? styles.onDark : null]}>{title}</Text>
      {description ? (
        <Text style={[styles.description, dark ? styles.onDarkMuted : null]}>
          {description}
        </Text>
      ) : null}
      {children}
    </View>
  );

  return (
    <SafeAreaView style={[styles.safeArea, dark ? styles.dark : null]}>
      {scroll ? (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.scrollContent}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.white },
  dark: { backgroundColor: colors.ink },
  scrollContent: { paddingBottom: spacing.hero },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  eyebrow: {
    color: colors.maroon,
    fontSize: typeScale.micro,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.black,
    fontSize: typeScale.hero,
    fontWeight: '900',
    letterSpacing: -2,
    lineHeight: 47,
  },
  description: {
    color: colors.charcoal,
    fontSize: typeScale.body,
    lineHeight: 24,
    maxWidth: 560,
  },
  onDark: { color: colors.white },
  onDarkMuted: { color: colors.taupe },
});
