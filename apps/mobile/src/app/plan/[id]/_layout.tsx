import { Stack, useLocalSearchParams } from 'expo-router';

import { usePlanRealtime } from '@/features/plans/data';

/**
 * A plan and the two screens over it. The plan's realtime channel is subscribed once here, for the
 * plan, Pull Someone In and GAME ON together (one channel per plan; a second subscription to the
 * same topic would throw). Pull Someone In draws the plan under its own sheet, so it appears
 * without a push animation; GAME ON is a full-screen takeover (GameOn.png).
 */
export default function PlanLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  usePlanRealtime(id);
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="pull-in" options={{ animation: 'none' }} />
      <Stack.Screen
        name="game-on"
        options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }}
      />
    </Stack>
  );
}
