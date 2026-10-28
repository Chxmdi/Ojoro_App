/**
 * Plan (Plan.png, forming situation): the count toward the lock (realtime gather), WHAT TIME?,
 * WHERE (the exact spot for members only), WHO'S IN, PULL SOMEONE IN and I CAN'T MAKE IT. When the
 * realtime status turns game_on, everyone in on this screen is taken to the GAME ON takeover at
 * the same moment. Expired and full plans never dead-end (States.png).
 */
import type { PlanStatus } from '@ojoro/contracts';
import * as Linking from 'expo-linking';
import { useFocusEffect, useIsFocused, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  Divider,
  Icon,
  IconButton,
  Modal,
  ParticipantList,
  ParticipantRow,
  PlaceMiniCard,
  PlanForming,
  Poll,
  Situation,
  Text,
  TextButton,
  useThemeColor,
  useToast,
  type Person,
} from '@/design-system';
import { updatedAt } from '@/lib/age';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';
import { useReportBlock } from '@/features/safety';

import { DownForSheet } from '../downfor/DownForSheet';
import { ExpiredBlock, FullBlock, SuggestTimeSheet } from './blocks';
import {
  useImDown,
  useLeavePlan,
  useMeetingPoint,
  useMyArea,
  useNow,
  useOnline,
  usePlaceTonight,
  usePlanCard,
  usePlanPoll,
  usePlanRoster,
  useTimeZone,
  useVoteTime,
  type PlanCard,
} from './data';
import { AsOf, ErrorState, OfflineBanner, PlanSkeleton, routes, TopBar } from './parts';
import {
  displayStatus,
  distanceKm,
  distanceLabel,
  formingVariant,
  leaveConfirm,
  lockNote,
  MAX_TIME_OPTIONS,
  moreLine,
  nextHost,
  pollClosed,
  pollCloses,
  pollModel,
  ROSTER_SHOWN,
  rosterMeta,
  shouldTakeOver,
  wherePrivacyLine,
  type RosterRow,
} from './planLogic';
import { floodlitLabel, planTitle, planWhen } from './time';

export function PlanScreen({ id }: { id: string }) {
  const auth = useAuth();
  const userId = auth.status === 'signed-in' ? auth.session.user.id : null;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const card = usePlanCard(id);
  const plan = card.data;

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(routes.home);
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      track('screen_viewed', { screen: 'plan', plan_id: id });
    }, [id]),
  );

  let body;
  if (card.isPending) body = <PlanSkeleton />;
  else if (plan === null || plan === undefined) {
    body = card.isError ? (
      <ErrorState error={ojoroErrorOf(card.error)} onRetry={() => void card.refetch()} />
    ) : (
      <NotFound onHome={() => router.replace(routes.home)} />
    );
  } else body = <PlanBody plan={plan} userId={userId} dataUpdatedAt={card.dataUpdatedAt} />;

  return (
    <Situation id="forming" className="flex-1" style={{ paddingTop: insets.top }}>
      {plan ? null : <TopBar title="PLAN" onBack={goBack} />}
      {body}
    </Situation>
  );
}

function NotFound({ onHome }: { onHome: () => void }) {
  return (
    <View className="gap-space-4 p-space-5" testID="plan-not-found">
      <Text variant="display-sm" role="heading">
        WE CAN'T FIND THAT PLAN.
      </Text>
      <Text variant="body">It may have been called off, or it isn't open to you.</Text>
      <Button variant="primary" block onPress={onHome}>
        BACK TO HOME
      </Button>
    </View>
  );
}

function toPerson(row: RosterRow, fresh: readonly string[]): Person {
  return { name: row.display_name, isNew: fresh.includes(row.user_id) };
}

/** Ids that arrived since the last roster, so the newest avatar gathers in. */
function useFreshIds(rows: readonly RosterRow[] | undefined): string[] {
  const key = (rows ?? []).map((r) => r.user_id).join(',');
  const [seen, setSeen] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);
  if (key !== seen) {
    if (seen !== null && seen !== '') {
      const before = new Set(seen.split(','));
      setFresh(key.split(',').filter((k) => k && !before.has(k)));
    }
    setSeen(key);
  }
  return fresh;
}

function PlanBody({ plan, userId, dataUpdatedAt }: { plan: PlanCard; userId: string | null; dataUpdatedAt: number }) {
  const id = plan.id;
  const router = useRouter();
  const toast = useToast();
  const focused = useIsFocused();
  const online = useOnline();
  const muted = useThemeColor('text-muted');
  const tz = useTimeZone(plan.place_id);
  const now = useNow([plan.deadline_at, plan.poll_closes_at]);

  const roster = usePlanRoster(id);
  const poll = usePlanPoll(id, userId);
  const joined = Boolean(plan.i_am_in);
  const isHost = plan.host_id === userId;
  const member = joined || isHost;
  const meeting = useMeetingPoint(id, member);
  const area = useMyArea(userId);
  const placeTonight = usePlaceTonight(id, plan.place_id, plan.starts_at);
  const imDown = useImDown(id);
  const leave = useLeavePlan(id);
  const vote = useVoteTime(id);
  const reportBlock = useReportBlock({ onBlocked: () => router.replace(routes.home) });

  const [missed, setMissed] = useState<{ activityId: string | null } | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [tryAgain, setTryAgain] = useState(false);

  const status: PlanStatus = displayStatus(plan, now);
  const count = plan.member_count;
  const variant = formingVariant(count, plan.capacity, status);
  const rows = (roster.data ?? []) as RosterRow[];
  const fresh = useFreshIds(roster.data as RosterRow[] | undefined);
  const host = rows.find((r) => r.is_host) ?? null;
  const title = planTitle(plan, now, tz);
  const when = planWhen(plan.starts_at, now, tz);

  // GAME ON takeover: only for people in, only on a change this screen saw, only while focused.
  const previous = useRef<PlanStatus | undefined>(undefined);
  useEffect(() => {
    const before = previous.current;
    previous.current = status;
    if (focused && shouldTakeOver(before, status, joined)) {
      track('game_on_shown', { plan_id: id, count, capacity: plan.capacity, source: 'plan' });
      router.push(routes.gameOn(id, true));
    }
  }, [status, joined, focused, id, count, plan.capacity, router]);

  // NEED ONE MORE, seen by someone who can pull someone in.
  const needShown = useRef(false);
  useEffect(() => {
    if (variant === 'need-one-more' && member && !needShown.current) {
      needShown.current = true;
      track('need_one_more_shown', { plan_id: id, count, capacity: plan.capacity });
    }
  }, [variant, member, id, count, plan.capacity]);

  const onJoin = () => {
    if (joined) return;
    track('im_down_tapped', { plan_id: id, source: 'plan', count, capacity: plan.capacity });
    setMissed(null);
    if (!online) toast.show({ kind: 'offline', message: "Offline. Your I'M DOWN goes through when you're back." });
    imDown.tap({
      onError: (e) => {
        const err = ojoroErrorOf(e);
        track('im_down_failed', { plan_id: id, code: err.code });
        if (err.code === 'plan_full') setMissed({ activityId: err.detail ?? plan.activity_id });
        else toast.show({ kind: 'error', message: errorMessage(err) });
      },
    });
  };

  const doLeave = () => {
    setConfirmLeave(false);
    leave.tap({
      onSuccess: (state) => {
        track('plan_left', { plan_id: id, count: state.member_count ?? null });
        toast.show({
          kind: 'neutral',
          message: `You're out. ${state.member_count ?? Math.max(0, count - 1)} of ${plan.capacity}.`,
          action: 'UNDO',
          onAction: () => imDown.tap(),
        });
      },
      onError: (e) => toast.show({ kind: 'error', message: errorMessage(ojoroErrorOf(e)) }),
    });
  };

  const onLeave = () => {
    track('cta_tapped', { cta: 'cant_make_it', plan_id: id });
    const ask = leaveConfirm({ count, capacity: plan.capacity, isHost, nextHost: nextHost(rows) });
    if (ask) setConfirmLeave(true);
    else doLeave();
  };
  const leaveAsk = leaveConfirm({ count, capacity: plan.capacity, isHost, nextHost: nextHost(rows) });

  const share = async () => {
    track('plan_shared', { plan_id: id });
    const url = Linking.createURL(`/plan/${id}`);
    try {
      await Share.share({ message: `${title}. ${when}${plan.place_name ? ` at ${plan.place_name}` : ''}. ${url}` });
    } catch {
      toast.show({ kind: 'neutral', message: "Sharing isn't available here." });
    }
  };

  const openReport = () =>
    reportBlock.open({
      subjectKind: 'plan',
      subjectId: id,
      ...(host && !isHost ? { personId: host.user_id, personName: host.display_name } : {}),
    } as Parameters<typeof reportBlock.open>[0]);

  // Poll
  const pollData = poll.data;
  const pm = pollModel(pollData?.options ?? [], pollData?.mine ?? null, tz);
  const closed = pollClosed(plan, status, now);
  const onVote = (index: number) => {
    const optionId = pm.ids[index];
    if (!optionId) return;
    if (!member) {
      toast.show({ kind: 'neutral', message: "The vote is for people in the plan. Tap I'M DOWN first." });
      return;
    }
    track('time_voted', { plan_id: id });
    vote.mutate(optionId, {
      onError: (e) => toast.show({ kind: 'error', message: errorMessage(ojoroErrorOf(e)) }),
    });
  };

  // Place
  const distance =
    area.data?.area_lat != null && area.data.area_lng != null && plan.place_lat != null && plan.place_lng != null
      ? distanceKm({ lat: area.data.area_lat, lng: area.data.area_lng }, { lat: plan.place_lat, lng: plan.place_lng })
      : null;

  // Who's in
  const shown = showAll ? rows : rows.slice(0, ROSTER_SHOWN);
  const restNames = showAll ? [] : rows.slice(ROSTER_SHOWN).map((r) => r.display_name);
  const hidden = Math.max(0, count - rows.length);
  const more = moreLine(restNames, roster.data ? hidden : 0);

  const forming = status === 'forming';
  const ended = status === 'expired' || status === 'cancelled';
  const full = status === 'game_on' && !joined;
  const stale = !online || imDown.isPaused;
  const asOf = updatedAt(dataUpdatedAt);

  return (
    <View className="flex-1">
      <TopBar
        title={`PLAN · ${title}`}
        onBack={() => (router.canGoBack() ? router.back() : router.replace(routes.home))}
        right={
          <>
            <IconButton icon="share" label="Share plan" onPress={() => void share()} />
            <IconButton icon="more" label="Report or block" onPress={openReport} testID="plan-more" />
          </>
        }
      />
      <ScrollView contentContainerClassName="pb-space-20" testID="plan-screen">
        <PlanForming
          key={status === 'game_on' ? 'game-on' : 'gathering'}
          activity={plan.sport_name}
          count={count}
          capacity={plan.capacity}
          participants={rows.map((r) => toPerson(r, fresh))}
          time={when}
          place={plan.place_name ?? 'Place to be agreed'}
          variant={variant}
          expired={ended}
          joined={joined}
          onJoin={onJoin}
          onInvite={() => {
            track('cta_tapped', { cta: 'pull_someone_in', plan_id: id, source: 'need_one_more' });
            router.push(routes.pullIn(id));
          }}
          onOpen={() => plan.activity_id && router.push(routes.activity(plan.activity_id))}
        />
        <View className="gap-space-10 px-space-5 pt-space-2">
          {stale ? <AsOf at={asOf} /> : null}

          {forming ? (
            <View className="flex-row items-start gap-space-2">
              <Icon name="clock" size={20} />
              <Text variant="body-sm" className="shrink" testID="lock-note">
                {lockNote(joined, plan.capacity)}
              </Text>
            </View>
          ) : null}

          {ended ? (
            <ExpiredBlock
              planId={id}
              cancelled={status === 'cancelled'}
              count={count}
              capacity={plan.capacity}
              timeZone={tz}
              now={now}
              onTryAgain={() => {
                track('cta_tapped', { cta: 'try_again_this_weekend', plan_id: id });
                setTryAgain(true);
              }}
            />
          ) : null}

          {(full || missed) && !joined ? (
            <FullBlock
              planId={id}
              activityId={missed?.activityId ?? plan.activity_id}
              justMissed={missed !== null}
              timeZone={tz}
            />
          ) : null}

          {pm.options.length >= 2 && !ended ? (
            <View className="gap-space-2">
              <Poll
                question="WHAT TIME?"
                options={pm.options}
                voted={member ? pm.voted : undefined}
                closes={pollCloses(plan, now, tz)}
                closed={closed}
                {...(closed ? null : { onVote })}
                testID="time-poll"
              />
              {member && !closed && pm.options.length < MAX_TIME_OPTIONS ? (
                <TextButton onPress={() => setSuggesting(true)} className="self-start">
                  SUGGEST ANOTHER TIME
                </TextButton>
              ) : null}
            </View>
          ) : null}

          <View className="gap-space-2" role="region" aria-label="Where">
            <Divider label="WHERE" />
            {plan.place_name ? (
              <PlaceMiniCard
                name={plan.place_name}
                kind={plan.sport_name}
                surface={plan.place_surface ?? undefined}
                distance={distanceLabel(distance)}
                lights={floodlitLabel(plan.place_floodlit_until) ?? undefined}
                plansTonight={placeTonight.data}
              />
            ) : (
              <Text variant="body">Place to be agreed.</Text>
            )}
            {member && meeting.data ? (
              <View className="flex-row items-start gap-space-2" testID="meeting-point">
                <Icon name="pin" size={16} />
                <Text variant="body-sm" className="shrink">{`Meet at ${meeting.data.label}.`}</Text>
              </View>
            ) : null}
            <Text variant="caption" muted>
              {wherePrivacyLine(host?.display_name ?? null)}
            </Text>
          </View>

          <View className="gap-space-2" role="region" aria-label="Who's in">
            <Divider label={`WHO'S IN · ${count} OF ${plan.capacity}`} />
            <ParticipantList testID="whos-in">
              {shown.map((r) => (
                <ParticipantRow
                  key={r.user_id}
                  person={{ name: r.display_name }}
                  role={r.is_host ? 'host' : 'in'}
                  meta={rosterMeta(r)}
                />
              ))}
            </ParticipantList>
            {more ? (
              <Pressable
                role="button"
                accessibilityLabel="Show everyone in"
                disabled={restNames.length === 0}
                onPress={() => setShowAll(true)}
                className="min-h-touch justify-center"
              >
                <Text variant="body-sm" muted style={{ color: muted }}>
                  {more}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {forming && member ? (
            <View className="gap-space-2" role="region" aria-label="Actions">
              {variant !== 'need-one-more' ? (
                <Button
                  variant="secondary"
                  block
                  onPress={() => {
                    track('cta_tapped', { cta: 'pull_someone_in', plan_id: id, source: 'plan' });
                    router.push(routes.pullIn(id));
                  }}
                  testID="pull-someone-in"
                >
                  PULL SOMEONE IN
                </Button>
              ) : null}
              {joined ? (
                <Button variant="ghost" block onPress={onLeave} loading={leave.isPending} testID="cant-make-it">
                  I CAN'T MAKE IT
                </Button>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>

      {!online ? (
        <OfflineBanner
          at={asOf}
          message={imDown.isPaused ? "Offline. Your I'M DOWN goes through when you're back." : undefined}
        />
      ) : null}

      <Modal
        visible={confirmLeave && leaveAsk !== null}
        title={leaveAsk?.title ?? 'LEAVE THIS PLAN?'}
        body={leaveAsk?.body ?? ''}
        confirm="LEAVE"
        cancel="KEEP IT"
        onConfirm={doLeave}
        onCancel={() => setConfirmLeave(false)}
      />
      <SuggestTimeSheet
        planId={id}
        visible={suggesting}
        onClose={() => setSuggesting(false)}
        startsAt={plan.starts_at}
        existing={(pollData?.options ?? []).map((o) => o.starts_at)}
        timeZone={tz}
      />
      <DownForSheet
        visible={tryAgain}
        onClose={() => setTryAgain(false)}
        initialSportId={plan.sport_id}
        initialWindowId="weekend"
        defaultRadiusKm={area.data?.discovery_radius_km}
        source="expired_plan"
      />
      {reportBlock.sheet}
    </View>
  );
}
