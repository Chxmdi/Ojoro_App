import { useLocalSearchParams } from 'expo-router';

import { CallOutComposer } from '@/features/challenges/CallOutComposer';

/**
 * `/challenge/new`: CALL OUT someone or a crew (undesigned; DESIGN_DECISIONS, Step 5 screens: A).
 * `?opponent=<user id>&name=` from a profile, `?crew=<crew id>&crewName=` from a crew.
 */
export default function NewCallOutRoute() {
  const p = useLocalSearchParams<{ opponent?: string; name?: string; crew?: string; crewName?: string }>();
  return <CallOutComposer opponent={p.opponent} name={p.name} crew={p.crew} crewName={p.crewName} />;
}
