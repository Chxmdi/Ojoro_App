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
export function HostNotAllowed({ what = 'program' }: { what?: 'program' | 'session' | 'series' }) {
  return (
    <View className="gap-space-4 px-space-5 pt-space-8" testID="host-not-allowed">
      <Text variant="title" accessibilityRole="header">
        {`Only the hosts of this ${what} can open this.`}
      </Text>
      <Text variant="body-sm" muted>
        Host tools show who's in, payments and private notes, so they stay with the people who run it. If you
        think you should be a host, ask the person who runs it to add you.
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
  if (!error || isHostNotAllowed(error)) return <HostNotAllowed what={what} />;
  return (
    <View className="gap-space-4 px-space-5 pt-space-8">
      <InlineError message={errorMessage(ojoroErrorOf(error))} action="RETRY" onAction={onRetry} testID="screen-error" />
    </View>
  );
}

/** The not-allowed page with its own header (the route layout uses it before any screen mounts). */
export function HostNotAllowedScreen() {
  return (
    <Screen situation="calm" scroll gutter={false}>
      <ScreenHeader overline="HOSTING" fallback={'/you' as Href} />
      <HostNotAllowed />
    </Screen>
  );
}
