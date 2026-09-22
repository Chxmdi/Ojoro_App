import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { ActionCard } from '@/components/ActionCard';
import { OjoroScreen } from '@/components/OjoroScreen';
import { StatusChip } from '@/components/StatusChip';
import { colors, spacing } from '@/theme/tokens';

export default function HomeScreen() {
  return (
    <OjoroScreen
      eyebrow="Ojoro Now"
      title="WHAT ARE YOU DOWN FOR?"
      description="Your city, friends and intent become plans you can actually join."
    >
      <View style={styles.chips}>
        <StatusChip label="Tonight" active />
        <StatusChip label="Near me" />
        <StatusChip label="Friends" />
      </View>

      <ActionCard
        eyebrow="Plan forming"
        title="Football tonight?"
        meta="Jeanne-Mance Park · around 7:30 PM · social/balanced"
        dark
      >
        <Text style={styles.darkMeta}>4 people are already down.</Text>
        <ActionButton
          label="I’M DOWN"
          onPress={() => router.push('/plan/football-tonight')}
        />
      </ActionCard>

      <ActionCard
        eyebrow="Crew"
        title="Inner Circle"
        meta="5 friends are free after 7. Turn the chat into a plan."
      >
        <ActionButton
          label="OPEN CREW"
          variant="secondary"
          onPress={() => router.push('/crew/inner-circle')}
        />
      </ActionCard>

      <ActionCard
        eyebrow="Challenge"
        title="Marcus called you out."
        meta="5K · this weekend · friendly rivalry"
      >
        <ActionButton
          label="VIEW CALL-OUT"
          variant="dark"
          onPress={() => router.push('/challenge/marcus-5k')}
        />
      </ActionCard>

      <ActionButton
        label="SEE THE FULL CORE PROTOTYPE"
        variant="ghost"
        onPress={() => router.push('/prototype')}
      />
    </OjoroScreen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  darkMeta: { color: colors.white, opacity: 0.86 },
});
