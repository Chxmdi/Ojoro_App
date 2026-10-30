import { useLocalSearchParams } from 'expo-router';

import { HostSeriesScreen } from '@/features/host/HostSeriesScreen';

/** `/host/[programId]/series/[id]`: edit a recurring series (HostSeries.png). */
export default function HostSeriesRoute() {
  const { programId, id } = useLocalSearchParams<{ programId: string; id: string }>();
  return <HostSeriesScreen key={id} programId={programId} seriesId={id} />;
}
