import { useLocalSearchParams } from 'expo-router';

import { HostInsightsScreen } from '@/features/host/HostInsightsScreen';

/** `/host/[programId]/insights`: insights and revenue (HostInsights.png). */
export default function HostInsightsRoute() {
  const { programId } = useLocalSearchParams<{ programId: string }>();
  return <HostInsightsScreen key={programId} programId={programId} />;
}
