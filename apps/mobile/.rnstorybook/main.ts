import type { StorybookConfig } from '@storybook/react-native';

/**
 * On-device Storybook (Metro). Stories live next to what they show:
 * `src/design-system/components/Button.stories.tsx`, `src/design-system/stories/*`.
 * After adding or moving a story file, Metro regenerates `storybook.requires.ts`
 * on start; `pnpm storybook:generate` does it by hand.
 */
const main: StorybookConfig = {
  stories: ['../src/**/*.stories.?(ts|tsx)'],
  deviceAddons: ['@storybook/addon-ondevice-controls', '@storybook/addon-ondevice-actions'],
};

export default main;
