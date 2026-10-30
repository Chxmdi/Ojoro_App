import { useLocalSearchParams } from 'expo-router';

import { HostSeasonScreen } from '@/features/host/HostSeasonScreen';

/** `/host/[programId]/league/[id]`: league operations (HostSeason.png). */
export default function HostSeasonRoute() {
  const { programId, id } = useLocalSearchParams<{ programId: string; id: string }>();
  return <HostSeasonScreen key={`${programId}:${id}`} programId={programId} leagueId={id} />;
}
