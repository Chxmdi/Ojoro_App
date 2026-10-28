import { useLocalSearchParams } from 'expo-router';

import { RunItBackScreen } from '@/features/recap/RunItBackScreen';

/** `/activity/[id]/run-it-back`: a new plan for the same people (RunItBack.png). */
export default function RunItBackScreenRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RunItBackScreen id={id} />;
}
