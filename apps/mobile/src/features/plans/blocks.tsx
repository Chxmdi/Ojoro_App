/**
 * Plan screen states from States.png: EXPIRED (never dead-ends: STILL ON TONIGHT + TRY AGAIN) and
 * COULDN'T JOIN (the error in words with the alert icon, and the waitlist), plus the undesigned
 * "suggest a time" sheet.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ActivityStrip, Button, Chip, Divider, Sheet, Text, Toast, useToast } from '@/design-system';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { useActivityCard, useJoinWaitlist, useProposeTime, useStillOn } from './data';
import { InlineError, routes } from './parts';
import {
  cancelledSummary,
  expiredSummary,
  suggestableTimes,
  waitlistNote,
  waitlistResult,
} from './planLogic';
import { clock, clockWithPeriod, dayDiff } from './time';

/* ---------- Expired ---------- */

export function ExpiredBlock({
  planId,
  cancelled,
  count,
  capacity,
  timeZone,
  now,
  onTryAgain,
}: {
  planId: string;
  cancelled: boolean;
  count: number;
  capacity: number;
  timeZone: string;
  now: Date;
  onTryAgain: () => void;
}) {
  const router = useRouter();
  const stillOn = useStillOn(planId, true);
  const rows = stillOn.data ?? [];
  const tonight = rows.length > 0 && rows.every((r) => dayDiff(r.starts_at, now, timeZone) === 0);
  return (
    <View className="gap-space-2" testID="plan-expired">
      <Text variant="display-sm" role="heading">
        {cancelled ? 'THE HOST CALLED IT OFF.' : "IT DIDN'T COME TOGETHER."}
      </Text>
      <Text variant="body-sm">{cancelled ? cancelledSummary() : expiredSummary(count, capacity)}</Text>
      {rows.length > 0 ? (
        <View testID="still-on">
          <Divider label={tonight ? 'STILL ON TONIGHT' : 'STILL ON SOON'} />
          {rows.map((r) => (
            <ActivityStrip
              key={r.plan_id}
              activity={r.title ?? r.sport_name}
              time={clock(r.starts_at, timeZone)}
              place={[r.place_name, r.distance_km !== null ? `${r.distance_km} km` : null].filter(Boolean).join(' · ')}
              count={r.member_count}
              capacity={r.capacity}
              onPress={() => {
                track('cta_tapped', { cta: 'still_on', plan_id: r.plan_id, from_plan_id: planId });
                router.push(routes.plan(r.plan_id));
              }}
            />
          ))}
        </View>
      ) : null}
      <Button variant="primary" block className="mt-space-2" onPress={onTryAgain} testID="try-again">
        TRY AGAIN THIS WEEKEND
      </Button>
    </View>
  );
}

/* ---------- Couldn't join / full ---------- */

export function FullBlock({
  planId,
  activityId,
  justMissed,
  timeZone,
}: {
  planId: string;
  activityId: string | null;
  /** The I'M DOWN that just failed with plan_full: say so with the alert icon. */
  justMissed: boolean;
  timeZone: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const activity = useActivityCard(planId, activityId);
  const waitlist = useJoinWaitlist(planId);
  const [error, setError] = useState<string | null>(null);
  const card = activity.data;
  const mine = card?.my_attendance ?? null;

  const join = () => {
    if (!activityId) return;
    track('cta_tapped', { cta: 'join_waitlist', plan_id: planId });
    setError(null);
    waitlist.tap(activityId, {
      onSuccess: (state) => {
        track('waitlist_joined', { plan_id: planId, status: state.status, position: state.waitlist_position });
        toast.show({ kind: 'success', message: waitlistResult(state) });
      },
      onError: (e) => setError(errorMessage(ojoroErrorOf(e))),
    });
  };

  return (
    <View className="gap-space-5" testID="plan-full">
      {justMissed ? (
        <Toast
          kind="error"
          message="Couldn't join. The last spot went a moment before you."
          action={mine ? undefined : 'WAITLIST'}
          onAction={join}
        />
      ) : null}
      {mine === 'confirmed' || mine === 'checked_in' ? (
        <View className="gap-space-2 bg-surface-raised p-space-5">
          <Text variant="title-sm">You're in the game</Text>
          <Text variant="body-sm">A spot opened and it's yours.</Text>
          {activityId ? (
            <Button variant="primary" block onPress={() => router.push(routes.activity(activityId))}>
              OPEN THE GAME
            </Button>
          ) : null}
        </View>
      ) : mine === 'waitlisted' ? (
        <View className="gap-space-2 bg-surface-raised p-space-5" testID="waitlisted">
          <Text variant="title-sm">You're on the waitlist</Text>
          <Text variant="body-sm">
            {card?.check_in_opens_at
              ? `If a spot opens before ${clock(card.check_in_opens_at, timeZone)} you're in automatically.`
              : "If a spot opens you're in automatically."}
          </Text>
        </View>
      ) : (
        <View className="gap-space-2 bg-surface-raised p-space-5" testID="waitlist-offer">
          <Text variant="title-sm">{justMissed ? 'Join the waitlist' : "It's full. Join the waitlist"}</Text>
          <Text variant="body-sm">
            {card ? waitlistNote(card.waitlist_count, card.check_in_opens_at, timeZone) : 'Checking the waitlist.'}
          </Text>
          {error ? <InlineError message={error} /> : null}
          <Button
            variant="primary"
            block
            loading={waitlist.isPending}
            disabled={!activityId}
            onPress={join}
            testID="join-waitlist"
          >
            JOIN WAITLIST
          </Button>
        </View>
      )}
    </View>
  );
}

/* ---------- Suggest a time (undesigned sheet) ---------- */

export function SuggestTimeSheet({
  planId,
  visible,
  onClose,
  startsAt,
  existing,
  timeZone,
}: {
  planId: string;
  visible: boolean;
  onClose: () => void;
  startsAt: string;
  existing: readonly string[];
  timeZone: string;
}) {
  const toast = useToast();
  const propose = useProposeTime(planId);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => new Date());
  const options = suggestableTimes(startsAt, existing, now);

  const send = () => {
    if (!picked) {
      setError('Pick a time.');
      return;
    }
    propose.mutate(picked, {
      onSuccess: () => {
        track('cta_tapped', { cta: 'suggest_time', plan_id: planId });
        toast.show({ kind: 'success', message: `${clockWithPeriod(picked, timeZone)} is on the vote.` });
        setPicked(null);
        onClose();
      },
      onError: (e) => setError(errorMessage(ojoroErrorOf(e))),
    });
  };

  return (
    <Sheet
      title="Suggest a time"
      visible={visible}
      onClose={onClose}
      actions={
        <View className="gap-space-2">
          {error ? <InlineError message={error} /> : null}
          <Button variant="primary" block loading={propose.isPending} onPress={send}>
            ADD TO THE VOTE
          </Button>
        </View>
      }
    >
      <View className="gap-space-3">
        <Text variant="body-sm" muted>
          Everyone in the plan can vote on it. The time with the most votes wins at GAME ON.
        </Text>
        <View className="flex-row flex-wrap gap-space-2">
          {options.map((t) => (
            <Chip
              key={t}
              selected={picked === t}
              onPress={() => {
                setPicked(t);
                setError(null);
              }}
            >
              {clockWithPeriod(t, timeZone)}
            </Chip>
          ))}
        </View>
        {options.length === 0 ? (
          <Text variant="body-sm">There's no other time left to suggest for this plan.</Text>
        ) : null}
      </View>
    </Sheet>
  );
}
