import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme/tokens';

type Option = {
  id: string;
  label: string;
  votes: number;
};

export function PollCard({
  eyebrow,
  title,
  options,
  selected,
  onSelect,
}: {
  eyebrow: string;
  title: string;
  options: Option[];
  selected?: string;
  onSelect: (id: string) => void;
}) {
  const total = options.reduce((sum, option) => sum + option.votes, 0);

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      {options.map((option) => {
        const active = selected === option.id;
        const percentage = total === 0 ? 0 : Math.round((option.votes / total) * 100);
        return (
          <Pressable
            key={option.id}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${option.label}, ${option.votes} votes, ${percentage} percent`}
            onPress={() => onSelect(option.id)}
            style={[styles.option, active ? styles.optionActive : null]}
          >
            <View style={styles.row}>
              <Text style={[styles.optionText, active ? styles.optionTextActive : null]}>
                {option.label}
              </Text>
              <Text style={[styles.votes, active ? styles.optionTextActive : null]}>
                {option.votes}
              </Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${percentage}%` }]} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  eyebrow: {
    color: colors.maroon,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.black,
    fontSize: 24,
    fontWeight: '900',
    marginBottom: spacing.xs,
  },
  option: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: spacing.md,
    gap: spacing.xs,
  },
  optionActive: {
    borderColor: colors.maroon,
    backgroundColor: '#F1E8E8',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  optionText: {
    color: colors.black,
    fontWeight: '800',
  },
  optionTextActive: {
    color: colors.maroon,
  },
  votes: {
    color: colors.charcoal,
    fontWeight: '900',
  },
  track: {
    height: 4,
    backgroundColor: colors.line,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.maroon,
    borderRadius: radius.pill,
  },
});
