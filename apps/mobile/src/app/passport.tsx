import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { OjoroScreen } from '@/components/OjoroScreen';
import { colors, radius, spacing } from '@/theme/tokens';

export default function PassportScreen() {
  return (
    <OjoroScreen
      eyebrow="Ojoro Passport"
      title="A LIFE IN MOTION."
      description="Identity is earned through things you actually did, people you moved with and places you experienced."
    >
      <View style={styles.passport}>
        <Text style={styles.brand}>OJORO</Text>
        <Text style={styles.heading}>MOVEMENT PASSPORT</Text>
        <Text style={styles.entry}>MONTRÉAL · FIRST 5-A-SIDE</Text>
        <Text style={styles.entry}>10 ACTIVITIES WITH INNER CIRCLE</Text>
        <Text style={styles.entry}>FIRST CHALLENGE · 5K</Text>
        <Text style={styles.entry}>BOXING · LEVEL 2</Text>
      </View>
      <ActionButton
        label="VIEW PROFILE"
        variant="dark"
        onPress={() => router.push('/profile/chimdi')}
      />
    </OjoroScreen>
  );
}

const styles = StyleSheet.create({
  passport: {
    minHeight: 420,
    borderRadius: radius.lg,
    padding: spacing.xl,
    backgroundColor: colors.ink,
    gap: spacing.lg,
  },
  brand: { color: colors.taupe, fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  heading: { color: colors.white, fontSize: 34, fontWeight: '900' },
  entry: {
    color: colors.white,
    borderWidth: 1,
    borderColor: colors.taupe,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: 12,
    fontWeight: '800',
  },
});
