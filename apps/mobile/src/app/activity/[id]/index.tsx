import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { AvatarCluster } from '@/components/AvatarCluster';
import { OjoroScreen } from '@/components/OjoroScreen';
import { usePrototype } from '@/state/PrototypeContext';
import { colors, radius, spacing } from '@/theme/tokens';

export default function ActivityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { participantCount, planState, startActivity } = usePrototype();

  return (
    <OjoroScreen
      eyebrow="Game On"
      title="5-A-SIDE FOOTBALL"
      description="The plan is now a confirmed activity."
      dark
    >
      <View style={styles.hero}>
        <Text style={styles.when}>TONIGHT · 7:30 PM</Text>
        <Text style={styles.place}>JEANNE-MANCE PARK</Text>
        <Text style={styles.meta}>Social / Balanced · 8 players · 90 min</Text>
      </View>

      <AvatarCluster count={Math.max(8, participantCount)} />

      <ActionButton
        label={planState === 'live' ? 'VIEW LIVE' : 'START LIVE PROTOTYPE'}
        onPress={() => {
          startActivity();
          router.push(`/activity/${id ?? 'football-tonight'}/live`);
        }}
      />
      <ActionButton
        label="DIRECTIONS"
        variant="secondary"
        onPress={() => router.push('/map')}
      />
    </OjoroScreen>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radius.lg,
    backgroundColor: colors.maroon,
    padding: spacing.xl,
    gap: spacing.xs,
  },
  when: { color: colors.taupe, fontSize: 12, fontWeight: '900' },
  place: { color: colors.white, fontSize: 28, fontWeight: '900' },
  meta: { color: colors.white, opacity: 0.88 },
});
