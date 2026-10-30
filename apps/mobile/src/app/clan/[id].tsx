import { useLocalSearchParams } from 'expo-router';

import { ClanScreen } from '@/features/clans/ClanScreen';

/** `/clan/[id]`: Clan (Clan.png). */
export default function ClanRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ClanScreen key={id} id={id} />;
}
