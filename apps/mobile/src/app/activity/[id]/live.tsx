import { useLocalSearchParams } from 'expo-router';

import { LiveScreen } from '@/features/live/LiveScreen';

/** `/activity/[id]/live`: the running game (LiveActivity.png). */
export default function LiveScreenRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <LiveScreen key={id} id={id} />;
}
