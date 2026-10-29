import { useLocalSearchParams } from 'expo-router';

import { CrewScreen } from '@/features/crews/CrewScreen';

/** `/crew/[id]`: a minimal crew page until CrewHome (step 6). */
export default function CrewRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CrewScreen key={id} id={id} />;
}
