import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { OjoroScreen } from '@/components/OjoroScreen';
import { PermissionCard } from '@/components/PermissionCard';

const permissions = [
  {
    title: 'LOCATION',
    description: 'See what can actually happen near you.',
    why: 'Ojoro uses your chosen precision to rank nearby activities and plans. Precise public presence is never enabled by this step.',
    label: 'CONTINUE TO LOCATION',
  },
  {
    title: 'NOTIFICATIONS',
    description: 'Know when a plan becomes real or someone needs you.',
    why: 'Ojoro prioritizes actionable notifications: Game On, Need One More, a challenge response or a friend pulling you into a plan.',
    label: 'CONTINUE TO NOTIFICATIONS',
  },
  {
    title: 'CONTACTS',
    description: 'Find people you already know without exposing your address book.',
    why: 'Contact matching is optional. Ojoro should store only the minimum data required for matching and never publish a contact list.',
    label: 'CONTINUE TO CONTACTS',
  },
  {
    title: 'CALENDAR',
    description: 'Protect the plans you commit to.',
    why: 'Calendar access helps detect conflicts and save confirmed activities. Ojoro does not need to expose private event names to other users.',
    label: 'CONTINUE TO CALENDAR',
  },
] as const;

export default function PermissionPrimerScreen() {
  const [index, setIndex] = useState(0);
  const item = permissions[index] ?? permissions[permissions.length - 1];
  const complete = index >= permissions.length - 1;

  const progress = useMemo(
    () => `${Math.min(index + 1, permissions.length)} / ${permissions.length}`,
    [index],
  );

  const next = () => {
    if (complete) {
      router.replace('/(tabs)');
      return;
    }
    setIndex((value) => Math.min(value + 1, permissions.length - 1));
  };

  return (
    <OjoroScreen
      eyebrow={`Privacy-first setup · ${progress}`}
      title="YOU CHOOSE WHAT OJORO KNOWS."
      description="Each permission is requested in context, with a clear reason and a useful fallback."
    >
      <PermissionCard
        title={item.title}
        description={item.description}
        why={item.why}
        primaryLabel={complete ? 'FINISH SETUP' : item.label}
        onPrimary={next}
        onSecondary={next}
      />
    </OjoroScreen>
  );
}
