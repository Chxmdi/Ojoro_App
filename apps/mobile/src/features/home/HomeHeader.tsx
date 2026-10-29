/** Home's header (Main.png, FirstHome.png): the wordmark, search and the bell with its count. */
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { IconButton, Text } from '@/design-system';

import { Bell } from '../notifications/Bell';

export function HomeHeader() {
  const router = useRouter();
  return (
    <View className="flex-row items-center justify-between pb-space-1 pl-space-5 pr-space-2 pt-space-3">
      <Text variant="display-xs" style={{ letterSpacing: 24 * 0.06 }} role="heading">
        OJORO
      </Text>
      <View className="flex-row items-center">
        <IconButton icon="search" label="Search" onPress={() => router.push('/discover')} />
        <Bell />
      </View>
    </View>
  );
}
