import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { IconButton, Screen, useToast } from '@/design-system';
import { AreaPicker } from '@/features/area/AreaPicker';
import { areaName } from '@/features/area/logic';
import { track } from '@/lib/analytics';

/**
 * Settings → Your area (undesigned). The onboarding picker as a settings screen. Reached from You's
 * settings sheet, Home's area prompt and Discover's no-area prompt.
 */
export default function AreaSettings() {
  const toast = useToast();

  useEffect(() => {
    track('screen_viewed', { screen: 'settings_area' });
  }, []);

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <Screen situation="calm" scroll gutter={false}>
      <AreaPicker
        source="settings"
        header={
          <View className="flex-row items-center pl-space-2 pt-space-2">
            <IconButton icon="back" label="Back" onPress={leave} />
          </View>
        }
        title="YOUR AREA"
        body="Ojoro shows plans, people and places around your neighbourhood. Change it when you move."
        submitLabel="SAVE"
        onSaved={(label) => {
          toast.show({ kind: 'success', message: `Saved. Your area is ${areaName(label) ?? label}.` });
          leave();
        }}
      />
    </Screen>
  );
}
