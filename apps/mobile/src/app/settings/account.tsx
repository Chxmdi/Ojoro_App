import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { DisplayText, Screen, Strip, StripList, Text } from '@/design-system';
import { maskedPhone } from '@/features/account/logic';
import { ScreenHeader } from '@/features/activities/ui';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';

/** Settings → Account. Not designed: which account this is, and DELETE ACCOUNT. */
export default function AccountSettings() {
  const auth = useAuth();
  const phone = auth.status === 'signed-in' ? maskedPhone(auth.session.user.phone) : null;

  useEffect(() => {
    track('screen_viewed', { screen: 'settings_account' });
  }, []);

  return (
    <Screen situation="calm" scroll gutter={false}>
      <ScreenHeader overline="SETTINGS" fallback={'/you' as Href} />
      <View className="gap-space-6 px-space-5 pb-space-10 pt-space-4" testID="settings-account-screen">
        <View className="gap-space-3">
          <DisplayText size="lg" accessibilityRole="header">
            ACCOUNT
          </DisplayText>
          {phone ? (
            <Text variant="body" testID="account-phone">
              {`Signed in with ${phone}.`}
            </Text>
          ) : null}
        </View>
        <StripList>
          <Strip
            title="Delete account"
            titleVariant="title-sm"
            meta="Your profile goes. Games you shared stay, as Former member."
            trailing="chevron"
            onPress={() => router.push('/settings/delete-account' as Href)}
            testID="settings-delete-account"
          />
        </StripList>
      </View>
    </Screen>
  );
}
