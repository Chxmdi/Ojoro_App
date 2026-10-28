/**
 * Pieces shared by the plan screens and Home: the top bar, the offline note and banner, the error
 * and not-found states, and route helpers.
 */
import type { OjoroError } from '@ojoro/contracts';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import {
  Button,
  Icon,
  IconButton,
  loadingProps,
  Skeleton,
  Text,
  Toast,
  useThemeColor,
} from '@/design-system';
import { clockTimeWithPeriod, clockTime } from '@/lib/age';
import { errorMessage } from '@/lib/errorMessages';

/* ---------- Routes ---------- */

export const routes = {
  home: '/' as Href,
  plan: (id: string) => ({ pathname: '/plan/[id]', params: { id } }) as unknown as Href,
  pullIn: (id: string) => ({ pathname: '/plan/[id]/pull-in', params: { id } }) as unknown as Href,
  gameOn: (id: string, celebrate: boolean) =>
    ({
      pathname: '/plan/[id]/game-on',
      params: celebrate ? { id, celebrate: '1' } : { id },
    }) as unknown as Href,
  // Built by the Activity slice (apps/mobile/src/app/activity/[id]).
  activity: (id: string) => `/activity/${id}` as Href,
  recap: (activityId: string) => `/activity/${activityId}/recap` as Href,
};

/* ---------- Top bar ---------- */

/** Back, a centred overline, and up to two actions (Plan.png header). */
export function TopBar({
  title,
  onBack,
  backLabel = 'Back',
  backIcon = 'back',
  right,
}: {
  title: string;
  onBack?: (() => void) | undefined;
  backLabel?: string;
  backIcon?: 'back' | 'close';
  right?: ReactNode;
}) {
  return (
    <View className="flex-row items-center justify-between px-space-2 pt-space-2">
      <View className="min-w-[88px] flex-row">
        {onBack ? <IconButton icon={backIcon} label={backLabel} onPress={onBack} /> : null}
      </View>
      <Text variant="overline" tone="text" className="shrink text-center" numberOfLines={1} role="heading">
        {title}
      </Text>
      <View className="min-w-[88px] flex-row justify-end">{right}</View>
    </View>
  );
}

/* ---------- Offline ---------- */

/** "Count as of 7:02 PM" under a plan when the count may be stale. */
export function AsOf({ at, what = 'Count' }: { at: Date | null; what?: string }) {
  const muted = useThemeColor('text-muted');
  if (!at) return null;
  return (
    <View className="flex-row items-center" style={{ gap: 6 }} testID="as-of">
      <Icon name="clock" size={16} color={muted} />
      <Text variant="caption" muted>
        {`${what} as of ${clockTimeWithPeriod(at)}`}
      </Text>
    </View>
  );
}

/** The offline strip at the bottom of a screen (States, OFFLINE). Stays while offline. */
export function OfflineBanner({ at, message }: { at: Date | null; message?: string | undefined }) {
  const text =
    message ?? (at ? `Offline. Showing the last count from ${clockTime(at)}.` : "Offline. We'll load this when you're back.");
  return (
    <View className="absolute bottom-0 left-0 right-0 p-space-5" pointerEvents="box-none" testID="offline-banner">
      <Toast kind="offline" message={text} />
    </View>
  );
}

/* ---------- Loading, error, not found ---------- */

export function PlanSkeleton({ label = 'Loading plan' }: { label?: string }) {
  return (
    <View className="gap-space-6 p-space-5" {...loadingProps(label)}>
      <Skeleton kind="object" />
      <Skeleton kind="text" lines={2} />
      <Skeleton kind="strip" />
      <Skeleton kind="strip" />
    </View>
  );
}

/** Words + the alert icon + one next step. Never red. */
export function ErrorState({
  error,
  onRetry,
  retryLabel = 'TRY AGAIN',
}: {
  error: OjoroError;
  onRetry?: (() => void) | undefined;
  retryLabel?: string;
}) {
  const text = useThemeColor('text');
  return (
    <View className="gap-space-4 p-space-5" role="alert" testID="error-state">
      <View className="flex-row items-start gap-space-2 border-l-4 border-text pl-space-3">
        <Icon name="alert" size={20} color={text} label="Error" />
        <Text variant="body" className="shrink">
          {errorMessage(error)}
        </Text>
      </View>
      {onRetry ? (
        <Button variant="secondary" block onPress={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </View>
  );
}

/** An inline error line under a control (heavier rule, the alert icon, the words). */
export function InlineError({ message, testID }: { message: string; testID?: string }) {
  const text = useThemeColor('text');
  return (
    <View className="flex-row items-start gap-space-2" role="alert" testID={testID}>
      <Icon name="alert" size={16} color={text} label="Error" />
      <Text variant="body-sm" className="shrink">
        {message}
      </Text>
    </View>
  );
}
