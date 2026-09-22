import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { OjoroScreen } from '@/components/OjoroScreen';
import { usePrototype } from '@/state/PrototypeContext';
import { colors, spacing } from '@/theme/tokens';

export default function LiveActivityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { finishActivity } = usePrototype();
  const activityId = id ?? 'football-tonight';

  return (
    <OjoroScreen
      eyebrow="Live"
      title="THE GAME IS ON."
      description="Live is intentionally useful, not a passive entertainment feed."
      dark
    >
      <View style={styles.score}>
        <Text style={styles.team}>BLACK</Text>
        <Text style={styles.number}>3 — 2</Text>
        <Text style={styles.team}>WHITE</Text>
      </View>
      <Text style={styles.detail}>
        62 min · 8 players checked in · participant confirmed
      </Text>
      <ActionButton
        label="FINISH ACTIVITY"
        onPress={() => {
          finishActivity();
          router.replace({
            pathname: '/activity/[id]/recap',
            params: { id: activityId },
          });
        }}
      />
    </OjoroScreen>
  );
}

const styles = StyleSheet.create({
  score: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xxl,
  },
  team: { color: colors.taupe, fontWeight: '900', fontSize: 12 },
  number: { color: colors.white, fontWeight: '900', fontSize: 44 },
  detail: { color: colors.taupe, lineHeight: 22 },
});
