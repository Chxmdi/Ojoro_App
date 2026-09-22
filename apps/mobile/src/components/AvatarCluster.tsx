import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/tokens';

const initials = ['M', 'J', 'A', 'K', 'R', 'S', 'T', 'N'];

export function AvatarCluster({ count }: { count: number }) {
  return (
    <View
      accessibilityLabel={`${count} people are currently down`}
      style={styles.row}
    >
      {initials.slice(0, count).map((initial, index) => (
        <View
          key={`${initial}-${index}`}
          style={[styles.avatar, { marginLeft: index === 0 ? 0 : -10 }]}
        >
          <Text style={styles.text}>{initial}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: colors.white,
    backgroundColor: colors.charcoal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { color: colors.white, fontWeight: '900' },
});
