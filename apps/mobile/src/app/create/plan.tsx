import { useLocalSearchParams } from 'expo-router';

import { PlanFormScreen } from '@/features/create/PlanFormScreen';

/** Create → Quick Plan, or Activity with `?kind=activity` (undesigned; a create_plan form). */
export default function CreatePlanRoute() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  return <PlanFormScreen kind={kind === 'activity' ? 'activity' : 'quick'} />;
}
