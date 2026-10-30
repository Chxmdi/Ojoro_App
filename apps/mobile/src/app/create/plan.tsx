import { useLocalSearchParams } from 'expo-router';

import { PlanFormScreen } from '@/features/create/PlanFormScreen';

/**
 * Create → Quick Plan, or Activity with `?kind=activity` (undesigned; a create_plan form).
 * `?place=<id>` (and `&sport=<id>`, `&at=<ISO start>`) prefill the form: CREATE ACTIVITY HERE on Place and CREATE HERE on Pulse.
 */
export default function CreatePlanRoute() {
  const { kind, place, sport, at } = useLocalSearchParams<{ kind?: string; place?: string; sport?: string; at?: string }>();
  return (
    <PlanFormScreen
      kind={kind === 'activity' ? 'activity' : 'quick'}
      placeId={typeof place === 'string' && place ? place : null}
      sportId={typeof sport === 'string' && sport ? sport : null}
      startsAt={typeof at === 'string' && at ? at : null}
    />
  );
}
