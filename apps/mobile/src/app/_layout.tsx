import '../global.css';

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useOjoroFonts } from '@/design-system';

// Hold the splash screen until Anton and Inter are ready, so no text flashes in a fallback face.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useOjoroFonts();
  const ready = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (fontError) console.warn('[fonts] failed to load, using system faces', fontError);
    if (ready) void SplashScreen.hideAsync();
  }, [ready, fontError]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
