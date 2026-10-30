import { useLocalSearchParams } from 'expo-router';

import { HostAnnounceScreen } from '@/features/host/HostAnnounceScreen';

/** `/host/[programId]/announce`: one message, pinned in the session chat (HostAnnounce.png). */
export default function HostAnnounceRoute() {
  const { programId } = useLocalSearchParams<{ programId: string }>();
  return <HostAnnounceScreen key={programId} programId={programId} />;
}
