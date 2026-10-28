import '../global.css';

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider, useOjoroFonts } from '@/design-system';
import { RouteGuard } from '@/features/auth/RouteGuard';
import { GateContext, useGateState } from '@/features/auth/useGate';
import { AuthProvider } from '@/lib/auth';
import { QueryProvider } from '@/lib/query';

// Hold the splash screen until Anton and Inter are ready, so no text flashes in a fallback face.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useOjoroFonts();
  const ready = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (fontError) console.warn('[fonts] failed to load, using system faces', fontError);
  }, [fontError]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <QueryProvider>
        <AuthProvider>
          <ToastProvider>
            <GatedStack />
          </ToastProvider>
        </AuthProvider>
      </QueryProvider>
    </SafeAreaProvider>
  );
}

/**
 * The auth gate (features/auth/gate.ts): signed out → Welcome; signed in without
 * `onboarding_completed_at` → onboarding; otherwise the app. Every screen is wrapped by
 * RouteGuard through `screenLayout`, so routes are protected by name without being listed here.
 */
function GatedStack() {
  const { gate, retry } = useGateState();
  const value = useMemo(() => ({ gate, retry }), [gate, retry]);
  const deciding = gate.kind === 'loading';

  useEffect(() => {
    // The splash stays up until the gate knows where to go: no flash of the wrong screen.
    if (!deciding) void SplashScreen.hideAsync();
  }, [deciding]);

  return (
    <GateContext value={value}>
      <Stack
        screenOptions={{ headerShown: false }}
        screenLayout={({ route, children }) => (
          <RouteGuard routeName={route.name}>{children}</RouteGuard>
        )}
      />
    </GateContext>
  );
}
