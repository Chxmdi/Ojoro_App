import { View } from 'react-native';

import { Screen, Text } from '@/design-system';

/** Discover tab. Scaffold only: the real screen is built in its milestone (HANDOFF.md, build order). */
export default function DiscoverTab() {
  return (
    <Screen situation="calm" scroll>
      <View className="gap-space-3 pb-space-10 pt-space-4">
        <Text variant="overline">Discover</Text>
        <Text variant="display-lg" accessibilityRole="header">
          Games near you land here.
        </Text>
      </View>
    </Screen>
  );
}
