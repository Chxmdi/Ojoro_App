import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme/tokens';

export function StatusChip({
  label,
  active = false,
}: {
  label: string;
  active?: boolean;
}) {
  return (
    <View style={[styles.chip, active ? styles.active : null]}>
      <Text style={[styles.text, active ? styles.activeText : null]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.paper,
  },
  active: { backgroundColor: colors.maroon },
  text: { color: colors.charcoal, fontSize: 12, fontWeight: '800' },
  activeText: { color: colors.white },
});
