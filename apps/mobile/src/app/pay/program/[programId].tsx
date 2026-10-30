import { useLocalSearchParams } from 'expo-router';

import { ProgramPassesScreen } from '@/features/payments/ProgramPassesScreen';

/** `/pay/program/[programId]?session=<id>`: a program's passes to buy (GET A PASS). */
export default function ProgramPassesRoute() {
  const { programId, session } = useLocalSearchParams<{ programId: string; session?: string }>();
  return <ProgramPassesScreen key={programId} programId={programId} sessionId={session ?? null} />;
}
