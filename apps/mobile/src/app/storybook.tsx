import { Redirect } from 'expo-router';

// With EXPO_PUBLIC_STORYBOOK_ENABLED unset, the withStorybook Metro wrapper swaps
// this import for a stub and drops every @storybook module, so production
// bundles carry no Storybook code. The redirect keeps /storybook from showing it.
import StorybookUIRoot from '../../.rnstorybook';

const enabled = process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === 'true';

/** The component gallery. Run with `pnpm storybook` (or `storybook:web`) and open /storybook. */
export default function StorybookScreen() {
  if (!enabled) return <Redirect href="/" />;
  return <StorybookUIRoot />;
}
