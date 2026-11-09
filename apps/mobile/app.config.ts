import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Native build config. What the owner fills in is listed in docs/RELEASE_CHECKLIST.md; nothing here is
 * a secret. Everything readable at runtime goes through `EXPO_PUBLIC_*` (inlined into the bundle).
 *
 * Variants follow `EXPO_PUBLIC_APP_ENV` (set per profile in eas.json): development and preview builds
 * get their own bundle id and name, so they install beside the store app.
 */

// Paste the project ID `eas init` prints (expo.dev → project → Overview) between the quotes. An env
// value wins, for CI and forks. Empty until the owner creates the EAS project.
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID || '';
// The Expo account or organisation that owns the project. Optional; set it with the project ID.
const EXPO_OWNER = process.env.EXPO_OWNER || '';

type AppEnv = 'development' | 'preview' | 'production';
const appEnv: AppEnv = ((): AppEnv => {
  const raw = process.env.EXPO_PUBLIC_APP_ENV;
  return raw === 'preview' || raw === 'production' ? raw : 'development';
})();

const variant = {
  development: { suffix: '.dev', name: 'Ojoro Dev' },
  preview: { suffix: '.preview', name: 'Ojoro Preview' },
  production: { suffix: '', name: 'Ojoro' },
}[appEnv];

const iosBundleId = (process.env.OJORO_IOS_BUNDLE_ID ?? 'com.ojoro.app') + variant.suffix;
const androidPackage = (process.env.OJORO_ANDROID_PACKAGE ?? 'com.ojoro.app') + variant.suffix;

// brand-oxblood and brand-white from design-handoff/design-system/tokens.json. Oxblood is the Welcome
// screen's ground, so the splash hands over to it without a flash. `pnpm --filter @ojoro/mobile icons`
// generates the art from tokens.json and fails if these two drift from it.
const OXBLOOD = '#290000';
const WHITE = '#ffffff';

// Apple privacy manifest: required-reason APIs used by React Native, AsyncStorage and Expo modules, and
// the data Ojoro collects (see docs/store/PRIVACY.md, which derives it from the code). Nothing tracks.
const collected = (
  type: string,
  purposes: string[] = ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
) => ({
  NSPrivacyCollectedDataType: `NSPrivacyCollectedDataType${type}`,
  NSPrivacyCollectedDataTypeLinked: true,
  NSPrivacyCollectedDataTypeTracking: false,
  NSPrivacyCollectedDataTypePurposes: purposes,
});

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: variant.name,
  slug: 'ojoro',
  // exactOptionalPropertyTypes: omit the key entirely when no owner is set.
  ...(EXPO_OWNER ? { owner: EXPO_OWNER } : {}),
  // The store version. Build numbers are kept by EAS (eas.json `appVersionSource: remote`).
  version: '0.1.0',
  orientation: 'portrait',
  // Deep links: ojoro://plan/<id>, ojoro://pay/return?checkout_id=…&result=success|cancel (Stripe
  // Checkout, through the `payments-return` function), ojoro://host/<programId>/payments?connect=…
  // (Stripe Connect onboarding), and Supabase Auth redirects. Expo Router resolves every path.
  scheme: 'ojoro',
  // Ojoro sets its own ground per situation; it never follows the system's light or dark mode.
  userInterfaceStyle: 'light',
  icon: './assets/icon.png',
  // The root view behind every screen: the calm ground (brand-white), not the splash's oxblood.
  backgroundColor: WHITE,
  ios: {
    // The designs are phone-only (390pt); no iPad layouts exist, so no iPad build.
    supportsTablet: false,
    bundleIdentifier: iosBundleId,
    config: {
      // Only standard HTTPS/TLS from the OS: exempt from export documentation.
      usesNonExemptEncryption: false,
    },
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['C617.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
          NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
          NSPrivacyAccessedAPITypeReasons: ['E174.1'],
        },
      ],
      NSPrivacyCollectedDataTypes: [
        collected('PhoneNumber'),
        collected('EmailAddress'),
        collected('Name'),
        collected('PreciseLocation'),
        collected('CoarseLocation'),
        collected('PhotosorVideos'),
        collected('EmailsOrTextMessages'),
        collected('OtherUserContent'),
        collected('Fitness'),
        collected('PurchaseHistory'),
        collected('UserID'),
        collected('ProductInteraction', [
          'NSPrivacyCollectedDataTypePurposeAppFunctionality',
          'NSPrivacyCollectedDataTypePurposeAnalytics',
        ]),
      ],
    },
  },
  android: {
    package: androidPackage,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      monochromeImage: './assets/adaptive-icon-monochrome.png',
      backgroundColor: OXBLOOD,
    },
    predictiveBackGestureEnabled: true,
    // The Supabase session lives in AsyncStorage; keep it out of cloud backups.
    allowBackup: false,
    // Location at check-in and while sharing for one game. Everything else is declared by the
    // libraries; the ones Ojoro never uses are blocked below.
    permissions: [
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
    ],
    blockedPermissions: [
      // Photos come from the system photo picker, which needs no storage permission.
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      // Never in the background.
      'android.permission.ACCESS_BACKGROUND_LOCATION',
    ],
  },
  web: {
    // The web build is the one product on the web; the variant names are for installed builds only.
    name: 'Ojoro',
    output: 'static',
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    // Expo applies the dev launcher's plugin whenever it is installed; release builds compile it out.
    'expo-dev-client',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 120,
        resizeMode: 'contain',
        backgroundColor: OXBLOOD,
      },
    ],
    [
      'expo-location',
      {
        // Location is read once at check-in, and while you share it for one game. Never in the background.
        locationWhenInUsePermission:
          'Ojoro checks you are at the game when you check in. If you choose to share, the people in that game see where you are until it ends.',
        // No "always" or motion prompts: remove the plugin's default strings for them.
        locationAlwaysAndWhenInUsePermission: false,
        locationAlwaysPermission: false,
        motionUsagePermission: false,
        isIosBackgroundLocationEnabled: false,
        isAndroidBackgroundLocationEnabled: false,
        isAndroidForegroundServiceEnabled: false,
      },
    ],
    [
      'expo-image-picker',
      {
        // Photos you pick are added to a game's After. There is no in-app camera.
        photosPermission: 'Ojoro adds the photos you pick to the game they came from.',
        cameraPermission: false,
        microphonePermission: false,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  // A new native layer gets a new runtime, so an over-the-air update never reaches a binary it can't run.
  runtimeVersion: {
    policy: 'fingerprint',
  },
  // Over-the-air updates need `expo-updates` (not installed yet: docs/RELEASE_CHECKLIST.md, step 9).
  ...(EAS_PROJECT_ID
    ? {
        updates: {
          url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
          checkAutomatically: 'ON_LOAD' as const,
          fallbackToCacheTimeout: 0,
        },
      }
    : {}),
  extra: {
    appEnv,
    ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
  },
});
