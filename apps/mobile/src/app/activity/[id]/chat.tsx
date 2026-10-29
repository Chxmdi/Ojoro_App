import { useLocalSearchParams } from 'expo-router';

import { ActivityChatScreen } from '@/features/chat/ActivityChatScreen';

/** `/activity/[id]/chat`: the game's chat, for the people in it (undesigned). */
export default function ActivityChatRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ActivityChatScreen key={id} id={id} />;
}
