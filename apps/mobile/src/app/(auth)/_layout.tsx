import { Stack } from 'expo-router';

/** Signed-out screens: Welcome, then phone number and code (the last two aren't designed). */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
