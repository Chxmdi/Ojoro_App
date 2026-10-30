import { Stack, useLocalSearchParams, type Href } from 'expo-router';

import { Screen } from '@/design-system';
import { LoadingState, ScreenHeader } from '@/features/activities/ui';
import { isHostNotAllowed, useHostProgramRealtime, useProgram } from '@/features/host/data';
import { HostNotAllowedScreen, HostUnavailable } from '@/features/host/ui';

/**
 * `/host/[programId]/…`: the Host OS stack (HANDOFF.md routes). Every screen under it is for the
 * program's hosts only, so the layout checks once with `host_home` (the server answers
 * `not_program_host` to anyone else) and shows a clear not-allowed page instead of the screens.
 * It also holds the program's realtime hint, so every host screen stays fresh from one channel.
 * The server still authorizes every read and write on its own (docs/HOSTS_CONTRACT.md).
 */
export default function HostLayout() {
  const { programId } = useLocalSearchParams<{ programId: string }>();
  const program = useProgram(programId ?? '');
  useHostProgramRealtime(program.data ? (programId ?? '') : '');

  if (program.error && isHostNotAllowed(program.error)) return <HostNotAllowedScreen />;
  if (program.data) return <Stack screenOptions={{ headerShown: false }} />;
  if (program.isSuccess) return <HostNotAllowedScreen />;
  return (
    <Screen situation="calm" scroll gutter={false}>
      <ScreenHeader overline="HOSTING" fallback={'/you' as Href} />
      {program.isPending ? (
        <LoadingState label="Loading your program" kinds={['text', 'strip', 'strip', 'strip']} />
      ) : (
        <HostUnavailable error={program.error} onRetry={() => void program.refetch()} />
      )}
    </Screen>
  );
}
