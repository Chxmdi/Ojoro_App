import { useLocalSearchParams } from 'expo-router';

import { CrewScreen } from '@/features/crews/CrewScreen';

/** `/crew/[id]`: Crew Home (CrewHome.png). */
export default function CrewRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CrewScreen key={id} id={id} />;
}
