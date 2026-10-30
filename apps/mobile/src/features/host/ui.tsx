/**
 * Shared pieces for the host screens (SCR-HOST-A; B and C may import them): the not-allowed state
 * a non-host sees on any host route, and a whole-screen failure with one next step.
 */
import { router, type Href } from 'expo-router';
import { View } from 'react-native';

import { Button, Screen, Text } from '@/design-system';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { InlineError, ScreenHeader } from '../activities/ui';
import { isHostNotAllowed } from './data';

/** Someone who doesn't run the program opened a host link: say so plainly, and offer a way out. */
export function HostNotAllowed({
  what = 'program',
  error,
}: {
  what?: 'program' | 'session' | 'series';
  error?: unknown;
}) {
  // Not found and not yours read alike on the server for sessions and series (RLS never says
  // which); a program you don't run says so plainly.
  const missing = !!error && ojoroErrorOf(error).code !== 'not_program_host';
  return (
    <View className="gap-space-4 px-space-5 pt-space-8" testID="host-not-allowed">
      <Text variant="title" accessibilityRole="header">
        {missing ? `We can't find that ${what}.` : `Only the hosts of this ${what} can open this.`}
      </Text>
      <Text variant="body-sm" muted>
        {missing
          ? `It may have been removed, or only its hosts can open it.`
          : "Host tools show who's in, payments and private notes, so they stay with the people who run it. If you think you should be a host, ask the person who runs it to add you."}
      </Text>
      <View className="flex-row flex-wrap gap-space-3">
        <Button variant="secondary" onPress={() => router.replace('/you' as Href)} testID="host-not-allowed-you">
          BACK TO YOU
        </Button>
      </View>
    </View>
  );
}

/** A whole-screen failure: not allowed (in words), or what went wrong and RETRY. */
export function HostUnavailable({
  error,
  onRetry,
  what = 'program',
}: {
  error: unknown;
  onRetry: () => void;
  what?: 'program' | 'session' | 'series';
}) {
  if (!error || isHostNotAllowed(error)) return <HostNotAllowed what={what} error={error} />;
  return (
    <View className="gap-space-4 px-space-5 pt-space-8">
      <InlineError message={errorMessage(ojoroErrorOf(error))} action="RETRY" onAction={onRetry} testID="screen-error" />
    </View>
  );
}

/** The not-allowed page with its own header (the route layout uses it before any screen mounts). */
export function HostNotAllowedScreen({ error }: { error?: unknown }) {
  return (
    <Screen situation="calm" scroll gutter={false}>
      <ScreenHeader overline="HOSTING" fallback={'/you' as Href} />
      <HostNotAllowed error={error} />
    </Screen>
  );
}
