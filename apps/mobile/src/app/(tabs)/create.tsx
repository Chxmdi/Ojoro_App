import { View } from 'react-native';

import { Screen, Text } from '@/design-system';

/** Create tab. Scaffold only: the real screen is built in its milestone (HANDOFF.md, build order). */
export default function CreateTab() {
  return (
    <Screen situation="calm" scroll>
      <View className="gap-space-3 pb-space-10 pt-space-4">
        <Text variant="overline">Create</Text>
        <Text variant="display-lg" accessibilityRole="header">
          Start something here.
        </Text>
      </View>
    </Screen>
  );
}
