import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore, type ReactNode } from 'react';
import { View } from 'react-native';

import { Button, Icon, Text } from '@/design-system';
import { clockTimeWithPeriod, updatedAt } from '@/lib/age';

/** True while the device has a connection (NetInfo drives TanStack Query's onlineManager). */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
    () => true,
  );
}

/**
 * An error in words: the alert icon, a heavier rule, and the message. Never red (CLAUDE.md).
 * Announced politely so screen readers hear it when it appears.
 */
export function InlineError({
  message,
  action,
  onAction,
  testID,
}: {
  message: string;
  action?: string | undefined;
  onAction?: (() => void) | undefined;
  testID?: string | undefined;
}) {
  return (
    <View
      className="gap-space-3 border-l-4 border-text py-space-2 pl-space-3"
      accessibilityLiveRegion="polite"
      aria-live="polite"
      testID={testID}
    >
      <View className="flex-row items-start gap-space-2">
        <Icon name="alert" size={20} label="Error" />
        <Text variant="body-sm" className="flex-1">
          {message}
        </Text>
      </View>
      {action && onAction ? (
        <Button variant="secondary" onPress={onAction} className="self-start">
          {action}
        </Button>
      ) : null}
    </View>
  );
}

/**
 * Offline: the last known state stays on screen with its age, and says what can't happen now.
 * States: "Offline. Showing the last count from 7:02."
 */
export function OfflineNote({
  dataUpdatedAt,
  what,
  extra,
}: {
  /** The query's `dataUpdatedAt`. */
  dataUpdatedAt: number;
  /** What is being shown: "your profile". */
  what: string;
  /** What waits for the connection ("Changes save when you're back."). */
  extra?: string | undefined;
}) {
  const at = updatedAt(dataUpdatedAt);
  const age = at ? ` Showing ${what} as of ${clockTimeWithPeriod(at)}.` : '';
  return (
    <View
      className="flex-row items-start gap-space-2 bg-surface-raised p-space-3"
      accessibilityLiveRegion="polite"
      aria-live="polite"
      testID="offline-note"
    >
      <Icon name="offline" size={20} />
      <Text variant="body-sm" className="flex-1">
        {`Offline.${age}${extra ? ` ${extra}` : ''}`}
      </Text>
    </View>
  );
}

/** A privacy state: what isn't shown, and why, without blaming anyone. */
export function PrivacyNote({ children }: { children: ReactNode }) {
  return (
    <View className="border-l-2 border-line-strong py-space-1 pl-space-3">
      <Text variant="body-sm" muted>
        {children}
      </Text>
    </View>
  );
}
