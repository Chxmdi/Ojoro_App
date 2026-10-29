import { useLocalSearchParams } from 'expo-router';

import { CrewChatScreen } from '@/features/crews/CrewChatScreen';

/** `/crew/[id]/chat`: the crew's chat and Make This a Game (CrewChat.png). */
export default function CrewChatRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CrewChatScreen key={id} id={id} />;
}
