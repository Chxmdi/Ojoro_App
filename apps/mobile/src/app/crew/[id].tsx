import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { ActionCard } from '@/components/ActionCard';
import { AvatarCluster } from '@/components/AvatarCluster';
import { OjoroScreen } from '@/components/OjoroScreen';
import { track } from '@/lib/analytics';
import { colors, radius, spacing } from '@/theme/tokens';

export default function CrewScreen() {
  return (
    <OjoroScreen
      eyebrow="Crew"
      title="INNER CIRCLE"
      description="Who’s around, what you’re doing next and what you’ve done together."
    >
      <AvatarCluster count={6} />

      <ActionCard
        eyebrow="Crew chat"
        title="“Basketball tomorrow?”"
        meta="Ojoro detected planning intent. 5 members are free after 7."
      >
        <ActionButton
          label="MAKE THIS A GAME"
          onPress={() => {
            track('crew_make_this_a_game', { crewId: 'inner-circle' });
            router.push('/plan/football-tonight');
          }}
        />
      </ActionCard>

      <View style={styles.momentum}>
        <Text style={styles.label}>CREW MOMENTUM</Text>
        <Text style={styles.value}>4 weeks moving together</Text>
        <Text style={styles.copy}>
          No broken streak. Missing a week becomes a comeback opportunity.
        </Text>
      </View>
    </OjoroScreen>
  );
}

const styles = StyleSheet.create({
  momentum: {
    backgroundColor: colors.paper,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  label: { color: colors.maroon, fontSize: 11, fontWeight: '900' },
  value: { color: colors.black, fontSize: 24, fontWeight: '900' },
  copy: { color: colors.charcoal, lineHeight: 20 },
});
