import type { ConfigContext, ExpoConfig } from 'expo/config';

const owner = process.env.EXPO_OWNER;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Ojoro',
  slug: 'ojoro',
  // exactOptionalPropertyTypes: omit the key entirely when EXPO_OWNER isn't set.
  ...(owner ? { owner } : {}),
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'ojoro',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: true,
    bundleIdentifier: process.env.OJORO_IOS_BUNDLE_ID ?? 'com.ojoro.app',
  },
  android: {
    package: process.env.OJORO_ANDROID_PACKAGE ?? 'com.ojoro.app',
    predictiveBackGestureEnabled: true,
  },
  web: {
    output: 'static',
  },
  plugins: ['expo-router', 'expo-dev-client'],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
  extra: {
    appEnv: process.env.EXPO_PUBLIC_APP_ENV ?? 'development',
    eas: process.env.EAS_PROJECT_ID
      ? {
          projectId: process.env.EAS_PROJECT_ID,
        }
      : undefined,
  },
});
