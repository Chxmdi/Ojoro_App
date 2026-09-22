import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { OjoroScreen } from '@/components/OjoroScreen';
import { colors, radius, spacing } from '@/theme/tokens';

export default function ProfileScreen() {
  return (
    <OjoroScreen
      eyebrow="Physical Identity"
      title="CHIMDI"
      description="Football · Boxing · Strength · Montréal"
    >
      <View style={styles.metrics}>
        <Metric label="Movement" value="82" />
        <Metric label="Community" value="74" />
        <Metric label="Reliability" value="91" />
      </View>
      <ActionButton
        label="CHALLENGE"
        onPress={() => router.push('/challenge/marcus-5k')}
      />
      <ActionButton
        label="TRAIN WITH"
        variant="secondary"
        onPress={() => router.push('/plan/football-tonight')}
      />
      <ActionButton
        label="VIEW PASSPORT"
        variant="secondary"
        onPress={() => router.push('/passport')}
      />
    </OjoroScreen>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  metrics: { flexDirection: 'row', gap: spacing.sm },
  metric: {
    flex: 1,
    backgroundColor: colors.paper,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  metricValue: { color: colors.black, fontSize: 28, fontWeight: '900' },
  metricLabel: { color: colors.charcoal, fontSize: 11, fontWeight: '800' },
});
