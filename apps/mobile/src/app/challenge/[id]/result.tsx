import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { OjoroScreen } from '@/components/OjoroScreen';
import { usePrototype } from '@/state/PrototypeContext';
import { colors, radius, spacing } from '@/theme/tokens';

export default function ChallengeResultScreen() {
  const { resetChallenge } = usePrototype();

  return (
    <OjoroScreen
      eyebrow="Verified result"
      title="CHIMDI WINS."
      description="The result becomes rivalry history—not a permanent status hierarchy."
    >
      <View style={styles.result}>
        <Text style={styles.name}>CHIMDI</Text>
        <Text style={styles.time}>23:41</Text>
        <Text style={styles.name}>MARCUS</Text>
        <Text style={styles.time}>24:08</Text>
      </View>
      <ActionButton
        label="REMATCH"
        onPress={() => {
          resetChallenge();
          router.replace({
            pathname: '/challenge/[id]',
            params: { id: 'marcus-5k' },
          });
        }}
      />
      <ActionButton
        label="BACK THIS RIVALRY"
        variant="secondary"
        onPress={() => router.push('/(tabs)/compete')}
      />
    </OjoroScreen>
  );
}

const styles = StyleSheet.create({
  result: {
    borderRadius: radius.lg,
    padding: spacing.xl,
    backgroundColor: colors.paper,
    gap: spacing.xs,
  },
  name: { color: colors.maroon, fontSize: 12, fontWeight: '900' },
  time: { color: colors.black, fontSize: 44, fontWeight: '900' },
});
