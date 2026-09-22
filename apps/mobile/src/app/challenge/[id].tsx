import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { OjoroScreen } from '@/components/OjoroScreen';
import { usePrototype } from '@/state/PrototypeContext';
import { colors, radius, spacing } from '@/theme/tokens';

export default function ChallengeScreen() {
  const {
    challengeState,
    acceptChallenge,
    counterChallenge,
    completeChallenge,
  } = usePrototype();

  const active = challengeState === 'active' || challengeState === 'countered';

  return (
    <OjoroScreen
      eyebrow="Call-Out"
      title="CHIMDI VS MARCUS"
      description="5K · this weekend · participant/device verification"
      dark
    >
      <View style={styles.poster}>
        <Text style={styles.small}>FRIENDLY RIVALRY</Text>
        <Text style={styles.big}>5K</Text>
        <Text style={styles.small}>
          Winner chooses the next Crew activity. No wagering.
        </Text>
      </View>

      {challengeState === 'pending' ? (
        <>
          <ActionButton label="ACCEPT" onPress={acceptChallenge} />
          <ActionButton label="COUNTER" variant="secondary" onPress={counterChallenge} />
          <ActionButton label="PASS" variant="ghost" onPress={() => router.back()} />
        </>
      ) : null}

      {active ? (
        <>
          <Text style={styles.status}>
            {challengeState === 'countered'
              ? 'Counter proposed: Sunday at 9 AM.'
              : 'Challenge active. Friends can follow and cheer.'}
          </Text>
          <ActionButton
            label="SIMULATE RESULT"
            onPress={() => {
              completeChallenge();
              router.push('/challenge/marcus-5k/result');
            }}
          />
        </>
      ) : null}

      {challengeState === 'complete' ? (
        <ActionButton
          label="VIEW RESULT"
          onPress={() => router.push('/challenge/marcus-5k/result')}
        />
      ) : null}
    </OjoroScreen>
  );
}

const styles = StyleSheet.create({
  poster: {
    minHeight: 260,
    backgroundColor: colors.maroon,
    borderRadius: radius.lg,
    padding: spacing.xl,
    justifyContent: 'space-between',
  },
  small: { color: colors.taupe, fontWeight: '900', fontSize: 12 },
  big: { color: colors.white, fontWeight: '900', fontSize: 88, letterSpacing: -5 },
  status: { color: colors.white, lineHeight: 22 },
});
