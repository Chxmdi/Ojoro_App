/**
 * Pieces shared by Place and Pulse: the offline note (last known state, and how old it is).
 */
import { View } from 'react-native';

import { Icon, Text } from '@/design-system';

import { clockWithPeriod } from '../activities/format';

/** Offline: the last known state stays, with its age. Both screens are reads, so nothing waits. */
export function OfflineNote({ dataUpdatedAt, what }: { dataUpdatedAt: number; what: string }) {
  const message =
    dataUpdatedAt > 0
      ? `Offline. Showing ${what} as of ${clockWithPeriod(dataUpdatedAt)}.`
      : `Offline. We'll load ${what} when you're back.`;
  return (
    <View
      className="flex-row items-start gap-space-2 bg-surface-raised p-space-3"
      accessibilityLiveRegion="polite"
      aria-live="polite"
      testID="offline-note"
    >
      <Icon name="offline" size={20} />
      <Text variant="body-sm" className="flex-1">
        {message}
      </Text>
    </View>
  );
}
