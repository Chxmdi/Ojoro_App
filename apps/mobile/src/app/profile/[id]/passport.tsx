import { Redirect, useLocalSearchParams } from 'expo-router';

import { PassportScreen } from '@/features/passport/PassportScreen';
import { useUserId } from '@/lib/auth';

/** Someone's Passport, as far as their history and goals settings let you see it (server-side). */
export default function ProfilePassportRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useUserId();
  if (!id) return <Redirect href="/" />;
  if (id === me) return <Redirect href="/passport" />;
  return <PassportScreen key={id} userId={id} self={false} />;
}
