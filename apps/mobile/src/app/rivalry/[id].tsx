import { useLocalSearchParams } from 'expo-router';

import { RivalryScreen } from '@/features/rivalry/RivalryScreen';

/** `/rivalry/[id]`: the head-to-head record, recent meetings and the rematch (Rivalry.png). */
export default function RivalryRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RivalryScreen key={id} id={id} />;
}
