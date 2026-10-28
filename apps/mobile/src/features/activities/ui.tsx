/**
 * Shared pieces for the activity screens: the header row, and the loading, error, offline, queued
 * and privacy states (States.png). Errors are words with the alert icon and a heavier rule, never red.
 */
import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import {
  Button,
  Icon,
  IconButton,
  loadingProps,
  Skeleton,
  Text,
  type SkeletonKind,
} from '@/design-system';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { clockWithPeriod } from './format';

/** Back, or home when this screen was opened directly (a link, a reload). */
export function goBack(fallback: Href = '/') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

/** The header row of the designs: back (44pt), an overline, and one action or a spacer. */
export function ScreenHeader({
  overline,
  right,
  fallback,
}: {
  overline: string;
  right?: ReactNode;
  fallback?: Href;
}) {
  return (
    <View className="flex-row items-center justify-between px-space-2 pt-space-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => goBack(fallback)}
        className="size-[44px] items-center justify-center"
        testID="header-back"
      >
        <Icon name="back" />
      </Pressable>
      <Text variant="overline" className="shrink text-center" accessibilityRole="header">
        {overline}
      </Text>
      {right ?? <View className="size-[44px]" />}
    </View>
  );
}

/** The overflow button that opens report (and block). */
export function MoreButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <IconButton icon="more" label={label} onPress={onPress} testID="header-more" />;
}

/** Skeletons shaped like what's coming, after 300 ms (Skeleton waits on its own). */
export function LoadingState({ label, kinds }: { label: string; kinds: SkeletonKind[] }) {
  return (
    <View className="gap-space-6 px-space-5 pt-space-6" {...loadingProps(label)}>
      {kinds.map((kind, i) => (
        <Skeleton key={`${kind}-${i}`} kind={kind} />
      ))}
    </View>
  );
}

/** An error in words with one next step. */
export function InlineError({
  message,
  action,
  onAction,
  testID,
}: {
  message: string;
  action?: string | null | undefined;
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
        <View className="self-start">
          <Button variant="secondary" onPress={onAction}>
            {action}
          </Button>
        </View>
      ) : null}
    </View>
  );
}

/** A whole-screen failure: what happened, and RETRY or back home. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const e = ojoroErrorOf(error);
  const gone = e.code === 'activity_not_found' || e.code === 'not_player';
  return (
    <View className="gap-space-4 px-space-5 pt-space-8">
      <InlineError
        message={gone ? "We can't find that game. It may have been removed, or it isn't open to you." : errorMessage(e)}
        action={gone ? 'BACK TO HOME' : 'RETRY'}
        onAction={gone ? () => router.replace('/') : onRetry}
        testID="screen-error"
      />
    </View>
  );
}

/** Nothing to show: the game doesn't exist or isn't visible to you (RLS never says which). */
export function NotFoundState() {
  return (
    <View className="gap-space-4 px-space-5 pt-space-8" testID="not-found">
      <Text variant="title">We can't find that game.</Text>
      <Text variant="body-sm" muted>
        It may have been removed, or it isn't open to you.
      </Text>
      <View className="self-start">
        <Button variant="secondary" href="/">
          BACK TO HOME
        </Button>
      </View>
    </View>
  );
}

/** Offline: the last known state stays, with its age, and says what waits. */
export function OfflineNote({ dataUpdatedAt, extra }: { dataUpdatedAt: number; extra?: string }) {
  const age = dataUpdatedAt > 0 ? ` Showing the game as of ${clockWithPeriod(dataUpdatedAt)}.` : '';
  return (
    <View
      className="flex-row items-start gap-space-2 bg-surface-raised p-space-3"
      accessibilityLiveRegion="polite"
      aria-live="polite"
      testID="offline-note"
    >
      <Icon name="offline" size={20} />
      <Text variant="body-sm" className="flex-1">
        {`Offline.${age} ${extra ?? "Taps wait until you're back."}`}
      </Text>
    </View>
  );
}

/** A tap that is waiting for the connection. */
export function QueuedNote({ what }: { what: string }) {
  return (
    <View className="flex-row items-center gap-space-2" accessibilityLiveRegion="polite" testID="queued-note">
      <Icon name="clock" size={16} />
      <Text variant="caption" muted className="flex-1">
        {`${what} is waiting for a connection. It goes through when you're back.`}
      </Text>
    </View>
  );
}

/** What isn't shown, and why. */
export function PrivacyNote({ children }: { children: ReactNode }) {
  return (
    <View className="border-l-2 border-line-strong py-space-1 pl-space-3" testID="privacy-note">
      <Text variant="body-sm" muted>
        {children}
      </Text>
    </View>
  );
}
