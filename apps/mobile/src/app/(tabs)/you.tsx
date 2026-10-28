import { ProfileScreen } from '@/features/profile/ProfileScreen';
import { useUserId } from '@/lib/auth';

/** You tab (You.png): your physical identity profile. */
export default function YouTab() {
  const userId = useUserId();
  return <ProfileScreen userId={userId} self />;
}
