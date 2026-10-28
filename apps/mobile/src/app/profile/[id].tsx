import { Redirect, useLocalSearchParams } from 'expo-router';

import { ProfileScreen } from '@/features/profile/ProfileScreen';
import { useUserId } from '@/lib/auth';

/** Someone's profile: the friend, public and blocked views (PRD §9.1), with report and block. */
export default function ProfileRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useUserId();
  if (!id) return <Redirect href="/" />;
  if (id === me) return <Redirect href="/you" />;
  return <ProfileScreen userId={id} self={false} />;
}
