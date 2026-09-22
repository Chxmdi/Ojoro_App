import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { OjoroScreen } from '@/components/OjoroScreen';
import { usePrototype } from '@/state/PrototypeContext';
import { colors, radius, spacing } from '@/theme/tokens';

export default function RecapScreen() {
  const { runItBack } = usePrototype();

  return (
    <OjoroScreen
      eyebrow="After"
      title="YOU MADE IT HAPPEN."
      description="The activity becomes a shared memory and the next plan is one tap away."
    >
      <View style={styles.poster}>
        <Text style={styles.score}>3 — 2</Text>
        <Text style={styles.heading}>GAME COMPLETE</Text>
        <Text style={styles.meta}>8 people · 90 min · Jeanne-Mance Park</Text>
        <Text style={styles.meta}>Participant confirmed · 1 new connection</Text>
      </View>

      <ActionButton
        label="RUN IT BACK"
        onPress={() => {
          runItBack();
          router.replace('/plan/football-tonight');
        }}
      />
      <ActionButton
        label="ADD TO PASSPORT"
        variant="secondary"
        onPress={() => router.push('/passport')}
      />
    </OjoroScreen>
  );
}

const styles = StyleSheet.create({
  poster: {
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.ink,
    gap: spacing.sm,
  },
  score: { color: colors.white, fontSize: 50, fontWeight: '900' },
  heading: { color: colors.white, fontSize: 28, fontWeight: '900' },
  meta: { color: colors.taupe, lineHeight: 20 },
});
