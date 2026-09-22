import { router } from 'expo-router';

import { ActionButton } from '@/components/ActionButton';
import { OjoroScreen } from '@/components/OjoroScreen';

export default function NotFoundScreen() {
  return (
    <OjoroScreen
      eyebrow="Not found"
      title="THAT MOVE IS GONE."
      description="The plan may have expired or the link may be invalid."
    >
      <ActionButton label="GO HOME" onPress={() => router.replace('/(tabs)')} />
    </OjoroScreen>
  );
}
