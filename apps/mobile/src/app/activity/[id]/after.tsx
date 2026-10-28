import { useLocalSearchParams } from 'expo-router';

import { AfterScreen } from '@/features/after/AfterScreen';

/** `/activity/[id]/after`: GOOD GAME., the result and moments (After.png). */
export default function AfterScreenRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AfterScreen id={id} />;
}
