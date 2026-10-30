import { useLocalSearchParams } from 'expo-router';

import { HostMembershipScreen } from '@/features/host/HostMembershipScreen';

/**
 * `/host/[programId]/payments`: memberships, refunds and payouts (HostMembership.png). Stripe's
 * onboarding comes back here as `?connect=return|refresh` (docs/PAYMENTS_CONTRACT.md, Return links).
 */
export default function HostMembershipRoute() {
  const { programId, connect } = useLocalSearchParams<{ programId: string; connect?: string }>();
  return <HostMembershipScreen key={programId} programId={programId} connect={connect} />;
}
