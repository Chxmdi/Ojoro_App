import { useLocalSearchParams } from 'expo-router';

import { RecapScreen } from '@/features/recap/RecapScreen';

/** `/activity/[id]/recap`: the recap poster and Passport stamp (Recap.png). */
export default function RecapScreenRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecapScreen id={id} />;
}
