import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { ActionCard } from '@/components/ActionCard';
import { OjoroScreen } from '@/components/OjoroScreen';
import { colors, radius, spacing } from '@/theme/tokens';

export default function ClanClashScreen() {
  return (
    <OjoroScreen
      eyebrow="Ojoro Clash"
      title="McGILL VS PLATEAU."
      description="A rivalry is a shared event, not an excuse for hostility."
      dark
    >
      <View style={styles.scoreboard}>
        <View style={styles.side}>
          <Text style={styles.name}>McGILL</Text>
          <Text style={styles.score}>4</Text>
        </View>
        <Text style={styles.vs}>VS</Text>
        <View style={styles.side}>
          <Text style={styles.name}>PLATEAU</Text>
          <Text style={styles.score}>3</Text>
        </View>
      </View>

      <ActionCard
        eyebrow="Clash card 3 of 5"
        title="Basketball · first to 21"
        meta="Saturday · 6:00 PM · McGill Gym · Organizer verified"
      />

      <ActionButton label="VIEW ROSTER" onPress={() => router.push('/clan/mcgill/roster')} />
      <ActionButton
        label="SIMULATE CLASH RECAP"
        variant="secondary"
        onPress={() => router.push('/clan/mcgill/recap')}
      />
    </OjoroScreen>
  );
}

const styles = StyleSheet.create({
  scoreboard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.maroon,
  },
  side: { alignItems: 'center', gap: spacing.xs },
  name: { color: colors.taupe, fontSize: 12, fontWeight: '900' },
  score: { color: colors.white, fontSize: 52, fontWeight: '900' },
  vs: { color: colors.white, fontSize: 18, fontWeight: '900' },
});
