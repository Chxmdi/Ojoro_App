import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { colors, radius, spacing } from '@/theme/tokens';

export function PermissionCard({
  title,
  description,
  why,
  primaryLabel,
  secondaryLabel = 'NOT NOW',
  onPrimary,
  onSecondary,
}: {
  title: string;
  description: string;
  why: string;
  primaryLabel: string;
  secondaryLabel?: string;
  onPrimary: () => void;
  onSecondary: () => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      <View style={styles.why}>
        <Text style={styles.whyLabel}>WHY OJORO ASKS</Text>
        <Text style={styles.whyText}>{why}</Text>
      </View>
      <ActionButton label={primaryLabel} onPress={onPrimary} />
      <ActionButton label={secondaryLabel} variant="ghost" onPress={onSecondary} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    gap: spacing.md,
  },
  title: {
    color: colors.black,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.7,
  },
  description: {
    color: colors.charcoal,
    fontSize: 16,
    lineHeight: 23,
  },
  why: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    gap: spacing.xs,
  },
  whyLabel: {
    color: colors.maroon,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  whyText: {
    color: colors.charcoal,
    lineHeight: 20,
  },
});
