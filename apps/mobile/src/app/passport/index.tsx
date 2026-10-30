import { useLocalSearchParams } from 'expo-router';

import { PassportScreen } from '@/features/passport/PassportScreen';
import { useUserId } from '@/lib/auth';

/**
 * `/passport`: your Passport detail (not designed; see docs/DESIGN_DECISIONS.md "Step 7 SCR-PASSPORT").
 * `?activity=`, `?event=` or `?entry=` puts the stamp a Recap or Result linked to on top.
 */
export default function PassportRoute() {
  const userId = useUserId();
  const { entry, activity, event } = useLocalSearchParams<{ entry?: string; activity?: string; event?: string }>();
  return <PassportScreen userId={userId} self target={{ entry, activity, event }} />;
}
