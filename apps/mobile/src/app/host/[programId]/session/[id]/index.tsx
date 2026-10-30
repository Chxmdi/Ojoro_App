import { useLocalSearchParams } from 'expo-router';

import { HostRosterScreen } from '@/features/host/HostRosterScreen';

/** `/host/[programId]/session/[id]`: tonight's roster and waitlist (HostRoster.png). */
export default function HostRosterRoute() {
  const { programId, id } = useLocalSearchParams<{ programId: string; id: string }>();
  return <HostRosterScreen key={id} programId={programId} sessionId={id} />;
}
