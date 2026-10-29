import { useLocalSearchParams } from 'expo-router';

import { CallOutScreen } from '@/features/challenges/CallOutScreen';

/** `/challenge/[id]`: a Call-Out, received or sent (CallOut.png, Step 5). */
export default function CallOutRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CallOutScreen key={id} id={id} />;
}
