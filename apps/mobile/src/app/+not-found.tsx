import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Screen, Text } from '@/design-system';

export default function NotFound() {
  return (
    <Screen situation="calm">
      <View className="flex-1 justify-center gap-space-3">
        <Text variant="overline">Not found</Text>
        <Text variant="display-lg" accessibilityRole="header">
          Nothing here.
        </Text>
        <Text variant="body">This link doesn't go anywhere in Ojoro.</Text>
        <Link href="/" replace asChild>
          <Pressable accessibilityRole="link" className="mt-space-4 min-h-touch justify-center self-start">
            <Text variant="label">Go home</Text>
          </Pressable>
        </Link>
      </View>
    </Screen>
  );
}
