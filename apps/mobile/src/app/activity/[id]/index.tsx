import { useLocalSearchParams } from 'expo-router';

import { ActivityScreen } from '@/features/activities/ActivityScreen';

/** `/activity/[id]`: the confirmed game (Activity.png). */
export default function ActivityScreenRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ActivityScreen id={id} />;
}
