import { useLocalSearchParams } from 'expo-router';

import { PullInScreen } from '@/features/plans/PullInScreen';

export default function PullInRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PullInScreen key={id} id={id} />;
}
