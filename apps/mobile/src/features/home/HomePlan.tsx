/** A plan you're in on Home (Main and FirstHome). */
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { PlanForming, TextButton } from '@/design-system';

import { usePlanRoster, type PlanCard } from '../plans/data';
import { routes } from '../plans/parts';
import { displayStatus, formingVariant } from '../plans/planLogic';
import { DEFAULT_TIME_ZONE, planWhen } from '../plans/time';

const TZ = DEFAULT_TIME_ZONE;

/** A plan you're in: forming (YOU'RE DOWN) or GAME ON (OPEN GAME). The object leads to the plan. */
export function HomePlan({ plan, now, joined }: { plan: PlanCard; now: Date; joined: boolean }) {
  const router = useRouter();
  const roster = usePlanRoster(plan.id);
  const status = displayStatus(plan, now);
  const tz = plan.place_time_zone || TZ;
  return (
    <View className="-mx-space-5">
      <PlanForming
        activity={plan.sport_name}
        count={plan.member_count}
        capacity={plan.capacity}
        participants={(roster.data ?? []).map((r) => ({ name: r.display_name }))}
        time={planWhen(plan.starts_at, now, tz)}
        place={plan.place_name ?? 'Place to be agreed'}
        variant={formingVariant(plan.member_count, plan.capacity, status)}
        joined={joined}
        onInvite={() => router.push(routes.pullIn(plan.id))}
        onOpen={() => plan.activity_id && router.push(routes.activity(plan.activity_id))}
      />
      <TextButton onPress={() => router.push(routes.plan(plan.id))} className="mx-space-5 self-end" testID={`see-plan-${plan.id}`}>
        SEE THE PLAN
      </TextButton>
    </View>
  );
}

