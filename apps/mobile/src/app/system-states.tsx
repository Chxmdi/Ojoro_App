import { router } from 'expo-router';

import { ActionCard } from '@/components/ActionCard';
import { OjoroScreen } from '@/components/OjoroScreen';
import { SystemState, type SystemStateKind } from '@/components/SystemState';

const states: SystemStateKind[] = [
  'loading',
  'empty',
  'offline',
  'error',
  'permission',
  'privacy',
  'expired',
];

export default function SystemStatesScreen() {
  return (
    <OjoroScreen
      eyebrow="D0 State Library"
      title="NO DEAD ENDS."
      description="Reusable system states ensure the prototype and production app always explain what happened and what the user can do next."
    >
      {states.map((kind) => (
        <SystemState
          key={kind}
          kind={kind}
          actionLabel={kind === 'empty' ? 'CREATE FROM DEMAND' : 'TRY AGAIN'}
          onAction={() => router.push(kind === 'empty' ? '/ojoro-now' : '/prototype')}
        />
      ))}
      <ActionCard
        eyebrow="Rule"
        title="Status must never rely on color alone."
        meta="Every state combines clear language, semantic accessibility labels and a recovery action when one exists."
      />
    </OjoroScreen>
  );
}
