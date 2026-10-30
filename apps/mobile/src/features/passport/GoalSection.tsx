import { goalHeadline, type GoalView, type Visibility } from '@ojoro/contracts';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Goal, loadingProps, Skeleton, useToast } from '@/design-system';
import { useImDown } from '@/features/plans/data';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { usePassportGoal } from './data';
import { GoalSheet } from './GoalSheet';
import { goalBody, nextStepAction, nextStepTitle } from './logic';

/**
 * The GOAL block (You.png) with live data: the goal headline, progress in words, the next real test,
 * and NEXT STEP with I'M DOWN on a game that moves it on. Yours adds SET A GOAL / CHANGE (a Sheet).
 * Someone else's shows only while their goals setting includes you, without the next step.
 */
export function GoalSection({
  userId,
  self,
  visible = true,
  goalsVisibility,
  from,
}: {
  userId: string;
  self: boolean;
  /** Their goals setting includes you (passport_view.goals_visible); always true for yourself. */
  visible?: boolean;
  goalsVisibility: Visibility | null;
  from: 'you' | 'passport';
}) {
  const goal = usePassportGoal(userId, self || visible);
  const [editing, setEditing] = useState(false);

  if (!self && (!visible || !goal.data)) return null;
  if (goal.isPending) {
    return (
      <View {...loadingProps('Loading your goal')}>
        <Skeleton kind="text" lines={2} />
      </View>
    );
  }
  // A failed goal read hides the block for others; for you it shows the empty state's SET A GOAL.
  const data = goal.data ?? null;

  return (
    <>
      <GoalWithStep goal={data} self={self} onEdit={self ? () => setEditing(true) : undefined} />
      {self ? (
        <GoalSheet
          visible={editing}
          onClose={() => setEditing(false)}
          userId={userId}
          goal={data}
          goalsVisibility={goalsVisibility}
          from={from}
        />
      ) : null}
    </>
  );
}

function GoalWithStep({ goal, self, onEdit }: { goal: GoalView | null; self: boolean; onEdit: (() => void) | undefined }) {
  const step = self && goal && !goal.achieved ? goal.next_step : null;
  const imDown = useImDown(step?.plan_id ?? '');
  const toast = useToast();
  const action = step ? nextStepAction(step) : null;
  const planHref = step
    ? ((step.activity_id ? `/activity/${step.activity_id}` : `/plan/${step.plan_id}`) as Href)
    : undefined;

  return (
    <Goal
      title={goal ? goalHeadline(goal) : null}
      body={goal ? goalBody(goal, new Date()) : undefined}
      onEdit={onEdit}
      testID="goal-block"
      nextStep={
        step && action
          ? {
              title: nextStepTitle(step),
              actionLabel: action.label,
              ...(action.joins
                ? {
                    onPress: () => {
                      track('im_down_tapped', {
                        plan_id: step.plan_id,
                        source: 'goal',
                        count: step.member_count,
                        capacity: step.capacity,
                      });
                      imDown.tap({
                        onSuccess: () => router.push(planHref!),
                        onError: (e) => {
                          const err = ojoroErrorOf(e);
                          if (err.code === 'plan_full') router.push(planHref!);
                          else toast.show({ kind: 'error', message: errorMessage(err) });
                        },
                      });
                    },
                  }
                : { href: planHref }),
            }
          : null
      }
    />
  );
}
