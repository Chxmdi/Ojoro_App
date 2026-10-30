import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/**/src/**/*.test.ts', 'packages/**/src/**/*.test.ts', 'supabase/functions/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      // Coverage measures pure TypeScript logic that runs in Node. React Native
      // UI (.tsx) and modules that need the RN runtime (Reanimated, expo-*)
      // can't execute under Vitest; they're verified by typecheck, the web
      // export build, Storybook and on-device testing instead.
      include: ['apps/**/src/**/*.ts', 'packages/**/src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.d.ts',
        '**/*.stories.*',
        '**/server.ts',
        // Generated from design-handoff/design-system/tokens.json (scripts/build-tokens.mjs).
        'packages/design-tokens/src/generated/**',
        // Mobile: Expo Router routes and RN-runtime design-system modules.
        'apps/mobile/src/app/**',
        // New pure modules under design-system/ are measured; list RN-only ones here.
        'apps/mobile/src/design-system/{index,fonts,haptics,motion,useThemeColor}.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
