/** The bell in Home's header (Main.png): `unread_count()`, live over `notifications:{me}`; opens Updates. */
import { useRouter } from 'expo-router';

import { IconButton } from '@/design-system';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';

import { useNotificationsRealtime, useUnreadCount } from './data';
import { bellLabel } from './logic';

export function Bell() {
  const auth = useAuth();
  const userId = auth.status === 'signed-in' ? auth.session.user.id : null;
  const router = useRouter();
  const unread = useUnreadCount(userId !== null);
  useNotificationsRealtime(userId);
  const count = unread.data ?? 0;
  return (
    <IconButton
      icon="bell"
      label={bellLabel(count)}
      count={count}
      testID="bell"
      onPress={() => {
        track('bell_tapped', { unread: count });
        router.push('/updates');
      }}
    />
  );
}
