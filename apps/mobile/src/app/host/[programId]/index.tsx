import { useLocalSearchParams } from 'expo-router';

import { HostHomeScreen } from '@/features/host/HostHomeScreen';

/** `/host/[programId]`: the host's dashboard (HostHome.png). */
export default function HostHomeRoute() {
  const { programId } = useLocalSearchParams<{ programId: string }>();
  return <HostHomeScreen key={programId} programId={programId} />;
}
