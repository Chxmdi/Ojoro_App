/**
 * Pull someone in (NeedOneMore.png): the plan underneath, and a sheet of people ranked by who's
 * most likely to say yes, with a reason each, the invite quota, and SEND n INVITES. The invitee
 * sees who's in, the time and the place. Nothing else.
 */
import type { PlanStatus } from '@ojoro/contracts';
import { useFocusEffect, useIsFocused, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Avatar,
  Button,
  Chip,
  loadingProps,
  PlanForming,
  Sheet,
  Situation,
  Skeleton,
  Text,
  Toast,
  useToast,
} from '@/design-system';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';
import { PULL_IN_QUOTA } from '@ojoro/contracts';

import {
  useNow,
  useOnline,
  usePlanCard,
  usePlanRoster,
  usePullIn,
  usePullInCandidates,
  usePullInQuota,
  useTimeZone,
  type PlanCard,
} from './data';
import { ErrorState, InlineError, routes, TopBar } from './parts';
import {
  candidateReason,
  displayStatus,
  formingVariant,
  inviteCaption,
  quotaLine,
  sendLabel,
  sentMessage,
  shouldTakeOver,
  togglePick,
  type Candidate,
  type RosterRow,
} from './planLogic';
import { dayLabel, planTitle, planWhen } from './time';

export function PullInScreen({ id }: { id: string }) {
  const auth = useAuth();
  const userId = auth.status === 'signed-in' ? auth.session.user.id : null;
  const insets = useSafeAreaInsets();
  const card = usePlanCard(id);
  const plan = card.data;

  useFocusEffect(
    useCallback(() => {
      track('screen_viewed', { screen: 'pull_in', plan_id: id });
    }, [id]),
  );

  return (
    <Situation id="forming" className="flex-1" style={{ paddingTop: insets.top }}>
      {plan ? <PullIn plan={plan} userId={userId} /> : null}
      {card.isError && !plan ? <ErrorState error={ojoroErrorOf(card.error)} onRetry={() => void card.refetch()} /> : null}
    </Situation>
  );
}

function PullIn({ plan, userId }: { plan: PlanCard; userId: string | null }) {
  const id = plan.id;
  const router = useRouter();
  const toast = useToast();
  const focused = useIsFocused();
  const online = useOnline();
  const tz = useTimeZone(plan.place_id);
  const now = useNow([plan.deadline_at]);
  const roster = usePlanRoster(id);
  const member = Boolean(plan.i_am_in) || plan.host_id === userId;
  const status = displayStatus(plan, now);
  const forming = status === 'forming';
  const quota = usePullInQuota(id, member);
  const candidates = usePullInCandidates(id, member && forming);
  const pullIn = usePullIn(id);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  const close = useCallback(() => {
    setOpen(false);
    if (router.canGoBack()) router.back();
    else router.replace(routes.plan(id));
  }, [router, id]);

  // GAME ON while the sheet is open (NeedOneMore → GameOn): the takeover replaces this screen.
  const previous = useRef<PlanStatus | undefined>(undefined);
  useEffect(() => {
    const before = previous.current;
    previous.current = status;
    if (focused && shouldTakeOver(before, status, Boolean(plan.i_am_in))) {
      track('game_on_shown', { plan_id: id, count: plan.member_count, capacity: plan.capacity, source: 'pull_in' });
      router.replace(routes.gameOn(id, true));
    }
  }, [status, focused, plan.i_am_in, plan.member_count, plan.capacity, id, router]);

  const rows = (roster.data ?? []) as RosterRow[];
  const remaining = quota.data?.remaining ?? PULL_IN_QUOTA;
  const total = quota.data?.quota ?? PULL_IN_QUOTA;
  const list = (candidates.data ?? []) as Candidate[];
  const pickedNames = list.filter((c) => picked.includes(c.user_id)).map((c) => c.display_name);
  const day = dayLabel(plan.starts_at, now, tz);

  const send = () => {
    if (picked.length === 0) {
      setError('Pick someone to invite.');
      return;
    }
    setError(null);
    track('cta_tapped', { cta: 'pull_in_send', plan_id: id, count: picked.length });
    pullIn.tap(picked, {
      onSuccess: (result) => {
        toast.show({ kind: 'success', message: sentMessage(result.sent ?? 0, pickedNames) });
        setPicked([]);
        close();
      },
      onError: (e) => {
        const err = ojoroErrorOf(e);
        if (err.code === 'invite_not_allowed' && err.detail) {
          const who = list.find((c) => c.user_id === err.detail)?.display_name ?? 'one person';
          setPicked((p) => p.filter((x) => x !== err.detail));
          setError(`You can't invite ${who} to this plan. We took them off your picks; send again.`);
        } else setError(errorMessage(err));
      },
    });
  };

  let content;
  if (!member) {
    content = <Text variant="body">Pull someone in once you're in the plan.</Text>;
  } else if (!forming) {
    content = <Text variant="body">This plan isn't taking invites any more.</Text>;
  } else if (candidates.isPending) {
    content = (
      <View className="gap-space-3" {...loadingProps('Loading people to invite')}>
        <Skeleton kind="text" lines={2} />
        <Skeleton kind="strip" />
        <Skeleton kind="strip" />
      </View>
    );
  } else if (candidates.isError) {
    content = <ErrorState error={ojoroErrorOf(candidates.error)} onRetry={() => void candidates.refetch()} />;
  } else {
    content = (
      <View className="gap-space-1">
        <Text variant="body-sm" muted className="mb-space-2" testID="quota-line">
          {quotaLine(remaining, total)}
        </Text>
        {list.length === 0 ? (
          <Text variant="body-sm" testID="no-candidates">
            Nobody you've played with is free to invite yet. People with Pull Me In on show here too.
          </Text>
        ) : (
          <ScrollView style={{ maxHeight: 320 }} role="list">
            {list.map((c) => {
              const on = picked.includes(c.user_id);
              return (
                <View
                  key={c.user_id}
                  role="listitem"
                  className="min-h-[64px] flex-row items-center gap-space-3 border-b border-line py-space-2"
                >
                  <Avatar name={c.display_name} size="md" />
                  <View className="flex-1">
                    <Text variant="title-sm">{c.display_name}</Text>
                    <Text variant="caption" muted>
                      {candidateReason(c, plan.sport_name, day)}
                    </Text>
                  </View>
                  <Chip
                    selected={on}
                    disabled={c.already_invited || (!on && picked.length >= remaining)}
                    onPress={() => setPicked((p) => togglePick(p, c.user_id, remaining))}
                    testID={`pick-${c.user_id}`}
                  >
                    {c.already_invited ? 'Invited' : on ? 'Picked' : 'Pick'}
                  </Chip>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    );
  }

  const canSend = member && forming && remaining > 0;

  return (
    <View className="flex-1">
      <TopBar title={`PLAN · ${planTitle(plan, now, tz)}`} onBack={close} />
      <PlanForming
        activity={plan.sport_name}
        count={plan.member_count}
        capacity={plan.capacity}
        participants={rows.map((r) => ({ name: r.display_name }))}
        time={planWhen(plan.starts_at, now, tz)}
        place={plan.place_name ?? 'Place to be agreed'}
        variant={formingVariant(plan.member_count, plan.capacity, status)}
        joined={Boolean(plan.i_am_in)}
      />
      <Sheet
        title="Pull someone in"
        visible={open}
        onClose={close}
        actions={
          canSend ? (
            <View className="gap-space-2">
              {!online ? <Toast kind="offline" message="Offline. Invites go out when you're back." /> : null}
              {error ? <InlineError message={error} testID="pull-in-error" /> : null}
              <Button variant="primary" block loading={pullIn.isPending} onPress={send} testID="pull-in-send">
                {sendLabel(picked.length)}
              </Button>
              <Text variant="caption" muted className="text-center">
                {inviteCaption(pickedNames)}
              </Text>
            </View>
          ) : undefined
        }
      >
        {content}
      </Sheet>
    </View>
  );
}
