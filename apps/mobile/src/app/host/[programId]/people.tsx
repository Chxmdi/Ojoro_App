import { useLocalSearchParams } from 'expo-router';

import { HostPeopleScreen } from '@/features/host/HostPeopleScreen';

/** `/host/[programId]/people`: the participant CRM (HostPeople.png). */
export default function HostPeopleRoute() {
  const { programId } = useLocalSearchParams<{ programId: string }>();
  return <HostPeopleScreen key={programId} programId={programId} />;
}
