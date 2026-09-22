import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { OjoroScreen } from '@/components/OjoroScreen';
import { colors, radius, spacing } from '@/theme/tokens';

const players = [
  ['ALEX T.', 'Captain · Guard'],
  ['MAYA R.', 'Forward'],
  ['CHIMDI', 'Guard'],
  ['JORDAN K.', 'Center'],
  ['SAM P.', 'Wing'],
  ['OPEN SPOT', 'Need one more'],
];

export default function ClanRosterScreen() {
  return (
    <OjoroScreen
      eyebrow="Clash roster"
      title="WHO’S SHOWING UP?"
      description="Competitive status stays grounded in actual participation."
    >
      {players.map(([name, role]) => (
        <View key={name} style={styles.row}>
          <View style={styles.avatar} />
          <View style={styles.copy}>
            <Text style={styles.name}>{name}</Text>
            <Text style={styles.role}>{role}</Text>
          </View>
          <Text style={styles.state}>{name === 'OPEN SPOT' ? 'OPEN' : 'IN'}</Text>
        </View>
      ))}
      <ActionButton label="BACK TO CLASH" onPress={() => router.back()} />
    </OjoroScreen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.paper,
    padding: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.charcoal,
  },
  copy: { flex: 1, gap: 2 },
  name: { color: colors.black, fontWeight: '900' },
  role: { color: colors.charcoal },
  state: { color: colors.maroon, fontWeight: '900' },
});
