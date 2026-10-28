import { useLocalSearchParams } from 'expo-router';

import { CheckInScreen } from '@/features/checkin/CheckInScreen';

/** `/activity/[id]/check-in`: YOU'RE HERE., arrivals and location sharing (CheckIn.png). */
export default function CheckInScreenRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CheckInScreen id={id} />;
}
