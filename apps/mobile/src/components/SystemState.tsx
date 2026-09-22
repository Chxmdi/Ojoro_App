import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { colors, radius, spacing } from '@/theme/tokens';

export type SystemStateKind =
  | 'loading'
  | 'empty'
  | 'offline'
  | 'error'
  | 'permission'
  | 'privacy'
  | 'expired';

const copy: Record<
  SystemStateKind,
  { eyebrow: string; title: string; description: string }
> = {
  loading: {
    eyebrow: 'Loading',
    title: 'GETTING THINGS MOVING.',
    description: 'Ojoro is refreshing the latest people, places and plans.',
  },
  empty: {
    eyebrow: 'Nothing yet',
    title: 'START THE MOMENT.',
    description: 'No matching activity exists yet. Create one from nearby intent.',
  },
  offline: {
    eyebrow: 'Offline',
    title: 'YOU’RE STILL IN THE GAME.',
    description: 'Your last known plans are available. Reconnect to refresh live state.',
  },
  error: {
    eyebrow: 'Something went wrong',
    title: 'TRY THAT AGAIN.',
    description: 'The action did not complete. Nothing was committed twice.',
  },
  permission: {
    eyebrow: 'Permission needed',
    title: 'YOU’RE IN CONTROL.',
    description: 'Enable only the access needed for this feature. You can change it later.',
  },
  privacy: {
    eyebrow: 'Privacy limited',
    title: 'SOME DETAILS ARE HIDDEN.',
    description: 'This person or activity shares only the context needed to participate.',
  },
  expired: {
    eyebrow: 'Expired',
    title: 'THAT MOMENT PASSED.',
    description: 'The old plan is closed. Ojoro can help you make the next one.',
  },
};

export function SystemState({
  kind,
  actionLabel,
  onAction,
}: {
  kind: SystemStateKind;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const item = copy[kind];

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={`${item.eyebrow}. ${item.title}. ${item.description}`}
      style={styles.panel}
    >
      <Text style={styles.eyebrow}>{item.eyebrow}</Text>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.description}>{item.description}</Text>
      {actionLabel && onAction ? (
        <ActionButton label={actionLabel} onPress={onAction} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
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
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  description: {
    color: colors.charcoal,
    fontSize: 14,
    lineHeight: 20,
  },
});
