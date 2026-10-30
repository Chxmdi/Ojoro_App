import { useLocalSearchParams } from 'expo-router';

import { HostMembershipScreen } from '@/features/host/HostMembershipScreen';

/** `/host/[programId]/payments`: memberships, refunds and payouts (HostMembership.png). */
export default function HostMembershipRoute() {
  const { programId } = useLocalSearchParams<{ programId: string }>();
  return <HostMembershipScreen key={programId} programId={programId} />;
}
