import { router, type Href } from 'expo-router';
import { View } from 'react-native';

import { Screen } from '@/design-system';
import { DeleteAccountView } from '@/features/account/DeleteAccountView';
import { ScreenHeader } from '@/features/activities/ui';
import { useUserId } from '@/lib/auth';

/** Settings → Account → DELETE ACCOUNT (features/account/DeleteAccountView). */
export default function DeleteAccountRoute() {
  const userId = useUserId();
  return (
    <Screen situation="calm" scroll gutter={false}>
      <ScreenHeader overline="ACCOUNT" fallback={'/settings/account' as Href} />
      <View className="px-space-5 pb-space-10 pt-space-4">
        <DeleteAccountView
          userId={userId}
          onCancel={() => (router.canGoBack() ? router.back() : router.replace('/settings/account' as Href))}
        />
      </View>
    </Screen>
  );
}
