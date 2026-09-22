import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { ActionCard } from '@/components/ActionCard';
import { OjoroScreen } from '@/components/OjoroScreen';
import { colors, radius, spacing } from '@/theme/tokens';

export default function ClanScreen() {
  return (
    <OjoroScreen
      eyebrow="Clan"
      title="OJORO McGILL"
      description="A persistent real-world community: missions, teams, rituals and rivalries."
    >
      <View style={styles.stats}>
        <Stat label="Members" value="312" />
        <Stat label="Weekly active" value="87" />
        <Stat label="Level" value="18" />
      </View>

      <ActionCard
        eyebrow="Mission"
        title="100 movement hours this week"
        meta="72 / 100 hours · every member can contribute."
      />

      <ActionCard
        eyebrow="Rivalry"
        title="McGill vs Plateau Ballers"
        meta="Basketball Clash · Saturday · roster needs 2"
        dark
      >
        <ActionButton
          label="JOIN THE ROSTER"
          onPress={() => router.push('/challenge/marcus-5k')}
        />
      </ActionCard>
    </OjoroScreen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: colors.paper,
    padding: spacing.md,
  },
  value: { color: colors.black, fontSize: 28, fontWeight: '900' },
  label: { color: colors.charcoal, fontSize: 11, fontWeight: '800' },
});
