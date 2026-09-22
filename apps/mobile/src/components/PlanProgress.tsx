import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme/tokens';

export function PlanProgress({
  count,
  capacity = 8,
}: {
  count: number;
  capacity?: number;
}) {
  const progress = Math.min(1, count / capacity);
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.number}>{count}</Text>
        <Text style={styles.capacity}> / {capacity} DOWN</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={styles.caption}>
        {count >= capacity
          ? 'GAME ON'
          : count === capacity - 1
            ? 'NEED ONE MORE'
            : `${capacity - count} more and this happens.`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'baseline' },
  number: {
    fontSize: 42,
    fontWeight: '900',
    color: colors.black,
    letterSpacing: -2,
  },
  capacity: { fontSize: 13, fontWeight: '900', color: colors.charcoal },
  track: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.maroon,
    borderRadius: radius.pill,
  },
  caption: { color: colors.charcoal, fontSize: 13, fontWeight: '700' },
});
