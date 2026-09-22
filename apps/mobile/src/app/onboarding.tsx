import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { OjoroScreen } from '@/components/OjoroScreen';
import { StatusChip } from '@/components/StatusChip';
import { colors, radius, spacing } from '@/theme/tokens';

export default function OnboardingScreen() {
  return (
    <OjoroScreen
      eyebrow="Welcome"
      title="BUILD YOUR PHYSICAL IDENTITY."
      description="Ojoro learns enough to create relevant real-world opportunities without turning onboarding into a questionnaire."
    >
      <View style={styles.section}>
        <Text style={styles.label}>SPORTS</Text>
        <View style={styles.row}>
          <StatusChip label="Football" active />
          <StatusChip label="Boxing" active />
          <StatusChip label="Running" />
        </View>
      </View>
      <View style={styles.section}>
        <Text style={styles.label}>INTENT</Text>
        <View style={styles.row}>
          <StatusChip label="Social" active />
          <StatusChip label="Improve" active />
          <StatusChip label="Competitive" />
        </View>
      </View>
      <View style={styles.section}>
        <Text style={styles.label}>AVAILABLE</Text>
        <Text style={styles.value}>Weeknights after 7 · within 5 km</Text>
      </View>
      <ActionButton
        label="CONTINUE TO PERMISSIONS"
        onPress={() => router.push('/permissions')}
      />
    </OjoroScreen>
  );
}

const styles = StyleSheet.create({
  section: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.paper,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  label: { color: colors.maroon, fontSize: 11, fontWeight: '900' },
  value: { color: colors.black, fontSize: 18, fontWeight: '800' },
});
