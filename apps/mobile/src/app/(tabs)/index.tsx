import { View } from 'react-native';

import { Screen, Text } from '@/design-system';

/** Home tab. Scaffold only: the real screen is built in its milestone (HANDOFF.md, build order). */
export default function HomeTab() {
  return (
    <Screen situation="calm" scroll>
      <View className="gap-space-3 pb-space-10 pt-space-4">
        <Text variant="overline">Home</Text>
        <Text variant="display-lg" accessibilityRole="header">
          Plans land here.
        </Text>
      </View>
    </Screen>
  );
}
