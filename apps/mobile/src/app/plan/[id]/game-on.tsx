import { useLocalSearchParams } from 'expo-router';

import { GameOnScreen } from '@/features/plans/GameOnScreen';

export default function GameOnRoute() {
  const { id, celebrate } = useLocalSearchParams<{ id: string; celebrate?: string }>();
  return <GameOnScreen key={id} id={id} celebrate={celebrate === '1'} />;
}
