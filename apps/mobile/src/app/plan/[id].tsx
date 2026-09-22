import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { AvatarCluster } from '@/components/AvatarCluster';
import { OjoroScreen } from '@/components/OjoroScreen';
import { PlanProgress } from '@/components/PlanProgress';
import { usePrototype } from '@/state/PrototypeContext';
import { colors, radius, spacing } from '@/theme/tokens';

export default function PlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    participantCount,
    joined,
    planState,
    joinPlan,
    addFriend,
    confirmGame,
  } = usePrototype();

  const gameOn = planState === 'game-on' || participantCount >= 8;
  const planId = id ?? 'football-tonight';

  return (
    <OjoroScreen
      eyebrow={gameOn ? 'Game On' : 'Plan Forming'}
      title={gameOn ? 'IT’S HAPPENING.' : 'SOCIAL GRAVITY.'}
      description={
        gameOn
          ? 'The threshold was reached. Time, place and people are now locked.'
          : 'Independent intent is becoming a real-world plan.'
      }
    >
      <View style={styles.panel}>
        <Text style={styles.title}>5-a-side Football</Text>
        <Text style={styles.meta}>Tonight · 7:30 PM · Jeanne-Mance Park</Text>
        <AvatarCluster count={participantCount} />
        <PlanProgress count={participantCount} />
      </View>

      {!joined && !gameOn ? (
        <ActionButton label="I’M DOWN" onPress={joinPlan} />
      ) : null}

      {!gameOn ? (
        <>
          <ActionButton
            label={
              participantCount === 7
                ? 'PULL IN ONE FRIEND'
                : 'SIMULATE A FRIEND JOINING'
            }
            variant="dark"
            onPress={addFriend}
          />
          <ActionButton
            label="FILL THE SQUAD"
            variant="secondary"
            onPress={confirmGame}
          />
        </>
      ) : (
        <ActionButton
          label="OPEN ACTIVITY"
          onPress={() =>
            router.push({
              pathname: '/activity/[id]',
              params: { id: planId },
            })
          }
        />
      )}
    </OjoroScreen>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.paper,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { fontSize: 28, fontWeight: '900', color: colors.black },
  meta: { color: colors.charcoal, lineHeight: 20 },
});
