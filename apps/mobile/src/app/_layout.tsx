import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { PrototypeProvider } from '@/state/PrototypeContext';

export default function RootLayout() {
  return (
    <PrototypeProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </PrototypeProvider>
  );
}
