import { useLocalSearchParams } from 'expo-router';

import { ClashScreen } from '@/features/clash/ClashScreen';

/** `/clash/[id]`: Ojoro Clash (Clash.png). */
export default function ClashRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ClashScreen key={id} id={id} />;
}
