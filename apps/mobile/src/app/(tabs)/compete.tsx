import { View } from 'react-native';

import { Screen, Text } from '@/design-system';

/** Compete tab. Scaffold only: the real screen is built in its milestone (HANDOFF.md, build order). */
export default function CompeteTab() {
  return (
    <Screen situation="live" scroll>
      <View className="gap-space-3 pb-space-10 pt-space-4">
        <Text variant="overline">Compete</Text>
        <Text variant="display-lg" accessibilityRole="header">
          Challenges land here.
        </Text>
      </View>
    </Screen>
  );
}
