import { useLocalSearchParams } from 'expo-router';

import { HostRequestsScreen } from '@/features/host/HostRequestsScreen';

/** `/host/[programId]/session/[id]/requests`: join requests for one session (HostRequests.png). */
export default function HostRequestsRoute() {
  const { programId, id } = useLocalSearchParams<{ programId: string; id: string }>();
  return <HostRequestsScreen key={id} programId={programId} sessionId={id} />;
}
