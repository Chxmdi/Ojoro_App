/**
 * Home (Main.png, Slice 01 parts): the Ojoro Daily headline (TONIGHT.), Down For, your plans,
 * plans you were pulled into, FORMING NEAR YOU and the recap of your last game, then the end of
 * the feed. Crew momentum and Challenges are not in Slice 01 and are left out. A quiet area gets
 * the FirstHome pattern: an honest line and one-tap Down For chips.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import {
  ActivityStrip,
  Chip,
  Divider,
  DownFor,
  Graphic,
  IconButton,
  loadingProps,
  PlanForming,
  Screen,
  Situation,
  Skeleton,
  Text,
  TextButton,
  useToast,
} from '@/design-system';
import { updatedAt } from '@/lib/age';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { useCreateDownFor, useMySignals, useSports, useWithdrawDownFor } from '../downfor/data';
import { DownForSheet } from '../downfor/DownForSheet';
import { signalLine, tonightArgs, type WindowId } from '../downfor/logic';
import { useImDown, useMyArea, useNow, useOnline, usePlanRoster, type PlanCard } from '../plans/data';
import { AsOf, ErrorState, OfflineBanner, routes } from '../plans/parts';
import { displayStatus, formingVariant } from '../plans/planLogic';
import { clock, DEFAULT_TIME_ZONE, dailyDate, planWhen } from '../plans/time';
import { useDownsNearby, useHomeRealtime, useInvitedPlans, useLastRecap, useMyPlans, usePlansNearby } from './data';
import {
  bestMove,
  dailyBody,
  dailyHeadline,
  downForWhen,
  downForWhere,
  formingLink,
  formingNearYou,
  peopleDown,
  pickDownFor,
  planForSport,
  recapHeadline,
  recapIsRecent,
  recapLine,
  recapWhen,
  type NearbyPlan,
} from './homeLogic';

const TZ = DEFAULT_TIME_ZONE;

type SheetPreset = { sportId: string | null; windowId?: WindowId };

export function HomeScreen() {
  const auth = useAuth();
  const userId = auth.status === 'signed-in' ? auth.session.user.id : null;
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const online = useOnline();
  const now = useNow([]);

  const downs = useDownsNearby();
  const nearby = usePlansNearby();
  const mine = useMyPlans(userId);
  const invited = useInvitedPlans(userId);
  const recap = useLastRecap(userId);
  const signals = useMySignals(userId);
  const sports = useSports();
  const area = useMyArea(userId);
  const create = useCreateDownFor();
  const withdraw = useWithdrawDownFor();
  useHomeRealtime(userId);
  const [sheet, setSheet] = useState<SheetPreset | null>(null);

  useFocusEffect(
    useCallback(() => {
      void qc.invalidateQueries({ queryKey: ['home'] });
    }, [qc]),
  );

  const sportName = (id: string) => sports.data?.find((s) => s.id === id)?.name ?? id;
  const downRows = downs.data ?? [];
  const nearbyRows = (nearby.data ?? []) as NearbyPlan[];
  const myPlans = mine.data ?? [];
  const myIds = new Set(myPlans.map((p) => p.id));
  const pick = pickDownFor(downRows, nearbyRows);
  const pickPlan = pick ? planForSport(nearbyRows, pick.sportId) : null;
  const best = bestMove(nearbyRows, now, TZ);
  const formingRows = formingNearYou(nearbyRows, myIds);
  const mySignal = signals.data?.[0] ?? null;
  const committed = pick ? (signals.data ?? []).some((s) => s.sport_id === pick.sportId) : false;
  const lastRecap = recap.data && recapIsRecent(recap.data.recap.occurred_at, now, TZ) ? recap.data : null;

  const loading = downs.isPending && nearby.isPending;
  const failed = downs.isError && nearby.isError && !downs.data && !nearby.data;
  const quiet = !loading && !failed && downRows.length === 0 && nearbyRows.length === 0 && myPlans.length === 0;
  const asOf = updatedAt(Math.max(downs.dataUpdatedAt, nearby.dataUpdatedAt));

  const onDown = () => {
    if (!pick || committed) return;
    track('im_down_tapped', { source: 'home_down_for', sport: pick.sportId, count: pick.people.length });
    const args = tonightArgs(pick.sportId, pick.latestEnd, new Date(), TZ);
    if (!args) {
      setSheet({ sportId: pick.sportId });
      return;
    }
    create.tap(
      { ...args, ...(area.data?.discovery_radius_km ? { p_radius_km: area.data.discovery_radius_km } : null) },
      {
        onSuccess: (state) => {
          if (state.matched_plan_id) {
            toast.show({ kind: 'success', message: 'Ojoro matched you into a plan.' });
            router.push(routes.plan(state.matched_plan_id));
          } else {
            toast.show({ kind: 'success', message: "You're down. It ends on its own." });
          }
        },
        onError: (e) => toast.show({ kind: 'error', message: errorMessage(ojoroErrorOf(e)) }),
      },
    );
  };

  const onWithdraw = (signalId: string) => {
    track('down_for_withdrawn', { source: 'home' });
    withdraw.mutate(signalId, {
      onSuccess: () => toast.show({ kind: 'neutral', message: "You're not down any more." }),
      onError: (e) => toast.show({ kind: 'error', message: errorMessage(ojoroErrorOf(e)) }),
    });
  };

  return (
    <Screen situation="calm" scroll gutter={false}>
      <View className="flex-row items-center justify-between pb-space-1 pl-space-5 pr-space-2 pt-space-3">
        <Text variant="display-xs" style={{ letterSpacing: 24 * 0.06 }} role="heading">
          OJORO
        </Text>
        <IconButton icon="search" label="Search" onPress={() => router.push('/discover')} />
      </View>

      <View className="gap-space-10 px-space-5 pb-space-10 pt-space-4" testID="home-feed">
        {/* Ojoro Daily */}
        <View className="gap-space-3" role="region" aria-label="Ojoro Daily">
          <Text variant="overline">{`OJORO DAILY · ${dailyDate(now, TZ)}`}</Text>
          <Text variant="display-xl" role="heading">
            {dailyHeadline(now, TZ)}
          </Text>
          {loading ? (
            <View {...loadingProps('Loading today')}>
              <Skeleton kind="text" lines={2} />
            </View>
          ) : (
            <Text variant="body" testID="daily-body">
              {dailyBody({ downCount: peopleDown(downRows), best, timeZone: TZ })}
            </Text>
          )}
          {!online ? <AsOf at={asOf} what="Updated" /> : null}
        </View>

        {failed ? (
          <ErrorState error={ojoroErrorOf(downs.error)} onRetry={() => void qc.invalidateQueries({ queryKey: ['home'] })} />
        ) : null}

        {/* Your Down For */}
        {mySignal ? (
          <View className="flex-row items-center justify-between gap-space-3" testID="my-signal">
            <Text variant="body-sm" className="shrink">
              {signalLine({ ...mySignal, sport_name: sportName(mySignal.sport_id) }, now, TZ)}
            </Text>
            <TextButton
              onPress={() => onWithdraw(mySignal.id)}
              accessibilityLabel={`Withdraw your Down For ${sportName(mySignal.sport_id)}`}
              testID="withdraw-down-for"
            >
              WITHDRAW
            </TextButton>
          </View>
        ) : null}

        {/* Down For */}
        {pick ? (
          <View className="gap-space-3" role="region" aria-label="Down for">
            <DownFor
              activity={sportName(pick.sportId)}
              when={downForWhen(pick.earliestStart, now, TZ)}
              where={downForWhere(pickPlan, pick.latestEnd, TZ)}
              downCount={pick.people.length + (committed ? 1 : 0)}
              downs={[...(committed ? [{ name: 'You', isNew: true }] : []), ...pick.people.map((p) => ({ name: p.name }))]}
              committed={committed}
              onDown={onDown}
            />
            {pickPlan ? (
              <Pressable role="link" onPress={() => router.push(routes.plan(pickPlan.plan_id))} className="min-h-touch justify-center">
                <Text variant="body-sm" style={{ textDecorationLine: 'underline' }}>
                  {`${formingLink(pickPlan)} `}
                  <Text variant="body-sm" style={{ fontWeight: '700' }}>
                    See it forming
                  </Text>
                </Text>
              </Pressable>
            ) : null}
            <TextButton onPress={() => setSheet({ sportId: null })} className="self-start" testID="down-for-other">
              SOMETHING ELSE
            </TextButton>
          </View>
        ) : !loading ? (
          <View className="gap-space-3" role="region" aria-label="Say what you're down for">
            <Divider label="SAY WHAT YOU'RE DOWN FOR" />
            <Text variant="body-sm">One tap. It expires on its own, and Ojoro gathers people around it.</Text>
            <View className="flex-row flex-wrap gap-space-2" role="group" aria-label="Quick Down For">
              {(sports.data ?? []).slice(0, 3).map((s) => (
                <Chip key={s.id} onPress={() => setSheet({ sportId: s.id, windowId: 'tonight' })}>
                  {`${s.name} tonight`}
                </Chip>
              ))}
              <Chip onPress={() => setSheet({ sportId: null })} testID="down-for-something-else">
                Something else
              </Chip>
            </View>
          </View>
        ) : null}

        {/* Your plans: forming, or GAME ON reached while you were elsewhere. */}
        {myPlans.length > 0 ? (
          <View className="gap-space-4" role="region" aria-label="Your plans">
            <Divider label="YOUR PLANS" />
            {myPlans.map((p) => (
              <HomePlan key={p.id} plan={p} now={now} joined />
            ))}
          </View>
        ) : null}

        {/* Pulled in */}
        {(invited.data ?? []).length > 0 ? (
          <View role="region" aria-label="Pulled in">
            <Divider label="PULLED IN" />
            {(invited.data ?? []).map((p) => (
              <ActivityStrip
                key={p.id}
                activity={p.title ?? p.sport_name}
                time={clock(p.starts_at, TZ)}
                place={p.place_name ?? 'Place to be agreed'}
                count={p.member_count}
                capacity={p.capacity}
                onPress={() => router.push(routes.plan(p.id))}
              />
            ))}
          </View>
        ) : null}

        {/* Forming near you */}
        {loading ? (
          <View {...loadingProps('Loading plans near you')}>
            <Skeleton kind="object" />
          </View>
        ) : formingRows.length > 0 ? (
          <View className="gap-space-4" role="region" aria-label="Forming near you">
            <Divider label="FORMING NEAR YOU" />
            {formingRows.map((p) => (
              <NearbyPlanObject key={p.plan_id} plan={p} now={now} />
            ))}
          </View>
        ) : null}

        {/* Last game */}
        {lastRecap ? (
          <View className="gap-space-4" role="region" aria-label="Last game">
            <Divider label={recapWhen(lastRecap.recap.occurred_at, now, TZ)} />
            <Pressable
              role="link"
              accessibilityHint="Opens the recap"
              onPress={() => router.push(routes.recap(lastRecap.recap.activity_id))}
              testID="home-recap"
            >
              <Situation id="after" className="gap-space-2 p-space-5">
                <Text variant="overline">{`RECAP${lastRecap.title ? ` · ${lastRecap.title.toUpperCase()}` : ''}`}</Text>
                <Text variant="display-md">{recapHeadline(lastRecap.recap)}</Text>
                <Text variant="body-sm">
                  {`${recapLine(lastRecap.recap)} `}
                  <Text variant="body-sm" style={{ fontWeight: '700' }}>
                    Run it back?
                  </Text>
                </Text>
              </Situation>
            </Pressable>
          </View>
        ) : null}

        {/* End of feed */}
        {!loading ? (
          <View className="items-center gap-space-3 pt-space-4" role="region" aria-label="End of feed">
            <Graphic kind="o" size={48} />
            <Text variant="display-sm" className="text-center" role="heading">
              {quiet ? "THAT'S EVERYTHING." : "YOU'RE CAUGHT UP."}
            </Text>
            <Text variant="body" muted className="text-center">
              {quiet ? "Start something and it'll be here tomorrow." : 'Go do something.'}
            </Text>
          </View>
        ) : null}
      </View>

      {!online ? (
        <OfflineBanner at={asOf} message={asOf ? undefined : "Offline. We'll load this when you're back."} />
      ) : null}

      <DownForSheet
        visible={sheet !== null}
        onClose={() => setSheet(null)}
        initialSportId={sheet?.sportId}
        initialWindowId={sheet?.windowId}
        defaultRadiusKm={area.data?.discovery_radius_km}
        source="home"
      />
    </Screen>
  );
}

/** A plan you're in: forming (YOU'RE DOWN) or GAME ON (OPEN GAME). The object leads to the plan. */
function HomePlan({ plan, now, joined }: { plan: PlanCard; now: Date; joined: boolean }) {
  const router = useRouter();
  const roster = usePlanRoster(plan.id);
  const status = displayStatus(plan, now);
  return (
    <View className="-mx-space-5">
      <PlanForming
        activity={plan.sport_name}
        count={plan.member_count}
        capacity={plan.capacity}
        participants={(roster.data ?? []).map((r) => ({ name: r.display_name }))}
        time={planWhen(plan.starts_at, now, TZ)}
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

/** A plan forming near you: I'M DOWN joins it here and opens it. */
function NearbyPlanObject({ plan, now }: { plan: NearbyPlan; now: Date }) {
  const router = useRouter();
  const toast = useToast();
  const imDown = useImDown(plan.plan_id);
  const roster = usePlanRoster(plan.plan_id);
  const [joined, setJoined] = useState(plan.i_am_in);
  const onJoin = () => {
    if (joined) return;
    track('im_down_tapped', { plan_id: plan.plan_id, source: 'home', count: plan.member_count, capacity: plan.capacity });
    setJoined(true);
    imDown.tap({
      onSuccess: () => router.push(routes.plan(plan.plan_id)),
      onError: (e) => {
        setJoined(false);
        const err = ojoroErrorOf(e);
        if (err.code === 'plan_full') router.push(routes.plan(plan.plan_id));
        else toast.show({ kind: 'error', message: errorMessage(err) });
      },
    });
  };
  return (
    <View className="-mx-space-5">
      <PlanForming
        activity={plan.sport_name}
        count={plan.member_count + (joined && !plan.i_am_in ? 1 : 0)}
        capacity={plan.capacity}
        participants={(roster.data ?? []).map((r) => ({ name: r.display_name }))}
        time={planWhen(plan.starts_at, now, TZ)}
        place={plan.place_name ?? 'Place to be agreed'}
        joined={joined}
        onJoin={onJoin}
      />
      <TextButton
        onPress={() => router.push(routes.plan(plan.plan_id))}
        className="mx-space-5 self-end"
        testID={`see-plan-${plan.plan_id}`}
      >
        SEE THE PLAN
      </TextButton>
    </View>
  );
}
