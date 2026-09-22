import { Pressable, StyleSheet, Text, View } from 'react-native';

import { OjoroScreen } from '@/components/OjoroScreen';
import { colors, radius, spacing } from '@/theme/tokens';

export default function HomeScreen() {
  return (
    <OjoroScreen
      eyebrow="Ojoro Now"
      title="WHAT ARE YOU DOWN FOR?"
      description="The production shell is ready for the D0 designs. This screen will become the action-first Ojoro home."
    >
      <View style={styles.intentCard}>
        <Text style={styles.intentLabel}>Tonight</Text>
        <Text style={styles.intentTitle}>Football around 7?</Text>
        <Text style={styles.intentMeta}>Plan Forming · 4 of 8 down</Text>
      </View>
      <Pressable style={styles.button} accessibilityRole="button">
        <Text style={styles.buttonText}>I’M DOWN</Text>
      </Pressable>
    </OjoroScreen>
  );
}

const styles = StyleSheet.create({
  intentCard: {
    marginTop: spacing.md,
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  intentLabel: {
    color: colors.taupe,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  intentTitle: {
    color: colors.white,
    fontSize: 28,
    fontWeight: '900',
  },
  intentMeta: {
    color: colors.white,
    fontSize: 14,
  },
  button: {
    alignItems: 'center',
    backgroundColor: colors.maroon,
    borderRadius: radius.pill,
    paddingVertical: 16,
  },
  buttonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
});
