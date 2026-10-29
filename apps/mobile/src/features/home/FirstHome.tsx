/**
 * FirstHome (FirstHome.png): Home when the area is quiet (`home_density().low_density`). An honest
 * day-one line from the counts, latent demand you can complete (I'M DOWN → create_from_demand),
 * one-tap Down For, bring your people, a bit further out, and the end of the feed. Never a dead
 * end: every block has its next action.
 */
import type { HomeDensity } from '@ojoro/contracts';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Share, View } from 'react-native';

import {
  ActivityStrip,
  Button,
  DisplayText,
  Divider,
  FeedEnd,
  LatentDemand,
  loadingProps,
  Panel,
  Screen,
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

import { AreaPrompt } from '../area/AreaPrompt';
import { useMySignals, useSports, useWithdrawDownFor } from '../downfor/data';
import { DownForSheet } from '../downfor/DownForSheet';
import { signalLine, type WindowId } from '../downfor/logic';
import { useNow, useOnline } from '../plans/data';
import { AsOf, OfflineBanner, routes } from '../plans/parts';
import { DEFAULT_TIME_ZONE } from '../plans/time';
import { useCreateFromDemand, useFurtherOut, useLatentDemand, useMyPlans, useMySportIds } from './data';
import {
  dayOverline,
  demandBand,
  FIRST_HOME_HEADLINE,
  firstHomeBody,
  furtherStrip,
  furtherTarget,
  inviteMessage,
  pickBucket,
  type Bucket,
} from './firstHomeLogic';
import { HomeHeader } from './HomeHeader';
import { HomePlan } from './HomePlan';
import { QuickDownFor } from './QuickDownFor';

const TZ = DEFAULT_TIME_ZONE;

type SheetPreset = { sportId: string | null; windowId?: WindowId };

export function FirstHome({ density, densityUpdatedAt }: { density: HomeDensity; densityUpdatedAt: number }) {
  const auth = useAuth();
  const userId = auth.status === 'signed-in' ? auth.session.user.id : null;
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const now = useNow([]);

  const demand = useLatentDemand(density.has_area);
  const further = useFurtherOut(density.has_area);
  const mySports = useMySportIds(userId);
  const catalog = useSports();
  const signals = useMySignals(userId);
  const mine = useMyPlans(userId);
  const withdraw = useWithdrawDownFor();
  const fromDemand = useCreateFromDemand();
  const [sheet, setSheet] = useState<SheetPreset | null>(null);
  // The bucket you just added yourself to: the count ticks and the button locks until the plan opens.
  const [joinedBucket, setJoinedBucket] = useState<Bucket | null>(null);

  const myIds = mySports.data ?? [];
  const bucket: Bucket | null = joinedBucket ?? pickBucket(demand.data ?? [], myIds);
  const band = bucket ? demandBand(bucket, now, TZ) : null;
  const furtherRows = further.data ?? [];
  const myPlans = mine.data ?? [];
  const mySignal = signals.data?.[0] ?? null;
  const sportName = (id: string) => catalog.data?.find((s) => s.id === id)?.name ?? id;
  const orderedSports = [
    ...myIds.map((id) => ({ id, name: sportName(id) })),
    ...(catalog.data ?? []).filter((s) => !myIds.includes(s.id)).map((s) => ({ id: s.id, name: s.name })),
  ];
  const asOf = updatedAt(Math.max(densityUpdatedAt, demand.dataUpdatedAt, further.dataUpdatedAt));

  const onDemand = () => {
    if (!bucket || joinedBucket) return;
    track('im_down_tapped', { source: 'first_home_demand', sport: bucket.sport_id, count: bucket.people_count });
    setJoinedBucket(bucket);
    fromDemand.tap(bucket, {
      onSuccess: (state) => {
        if (state.plan_id) router.push(routes.plan(state.plan_id));
      },
      onError: (e) => {
        setJoinedBucket(null);
        const err = ojoroErrorOf(e);
        toast.show({ kind: 'error', message: errorMessage(err) });
        if (err.code === 'area_required') router.push('/settings/area');
        else if (err.code === 'demand_unavailable') {
          void demand.refetch();
          setSheet({ sportId: bucket.sport_id });
        }
      },
    });
  };

  const onInvite = async () => {
    track('invite_friends_tapped', { source: 'first_home' });
    try {
      await Share.share({ message: inviteMessage(Linking.createURL('/')) });
    } catch {
      toast.show({ kind: 'error', message: "Sharing isn't available here. Copy the link from the app store page instead." });
    }
  };

  return (
    <Screen situation="calm" scroll gutter={false}>
      <HomeHeader />

      <View className="gap-space-10 px-space-5 pb-space-10 pt-space-4" testID="first-home">
        <AreaPrompt userId={userId} show={!density.has_area} />

        {/* Day one */}
        <View className="gap-space-3" role="region" aria-label="Day one">
          <Text variant="overline" testID="first-home-day">
            {dayOverline(density)}
          </Text>
          <DisplayText size="lg" accessibilityRole="header">
            {FIRST_HOME_HEADLINE}
          </DisplayText>
          {demand.isPending && density.has_area ? (
            <View {...loadingProps('Loading what people want near you')}>
              <Skeleton kind="text" lines={2} />
            </View>
          ) : (
            <Text variant="body" testID="first-home-body">
              {firstHomeBody(density, bucket, now, TZ)}
            </Text>
          )}
          {!online ? <AsOf at={asOf} what="Updated" /> : null}
        </View>

        {mySignal ? (
          <View className="flex-row items-center justify-between gap-space-3" testID="my-signal">
            <Text variant="body-sm" className="shrink">
              {signalLine({ ...mySignal, sport_name: sportName(mySignal.sport_id) }, now, TZ)}
            </Text>
            <TextButton
              onPress={() => {
                track('down_for_withdrawn', { source: 'first_home' });
                withdraw.mutate(mySignal.id, {
                  onSuccess: () => toast.show({ kind: 'neutral', message: "You're not down any more." }),
                  onError: (e) => toast.show({ kind: 'error', message: errorMessage(ojoroErrorOf(e)) }),
                });
              }}
              accessibilityLabel={`Withdraw your Down For ${sportName(mySignal.sport_id)}`}
              testID="withdraw-down-for"
            >
              WITHDRAW
            </TextButton>
          </View>
        ) : null}

        {myPlans.length > 0 ? (
          <View className="gap-space-4" role="region" aria-label="Your plans">
            <Divider label="YOUR PLANS" />
            {myPlans.map((p) => (
              <HomePlan key={p.id} plan={p} now={now} joined />
            ))}
          </View>
        ) : null}

        {/* People want this */}
        {bucket && band ? (
          <LatentDemand
            variant="band"
            count={bucket.people_count + (joinedBucket ? 1 : 0)}
            threshold={band.threshold}
            overline={band.overline}
            headline={band.headline}
            summary={band.summary}
            joined={joinedBucket !== null}
            pending={fromDemand.isPending}
            onPress={onDemand}
            testID="first-home-demand"
          />
        ) : demand.isError && !demand.data ? (
          <Text variant="body-sm" muted testID="demand-error">
            {`${errorMessage(ojoroErrorOf(demand.error))} Say what you're down for below and Ojoro gathers people around it.`}
          </Text>
        ) : null}

        <QuickDownFor
          sports={orderedSports}
          downFor={(signals.data ?? []).map((s) => s.sport_id)}
          radiusKm={density.radius_km}
          onSomethingElse={() => setSheet({ sportId: null })}
          source="first_home"
        />

        {/* Bring your people. START A CREW waits for Crews (M7). */}
        <Panel
          overline="BRING YOUR PEOPLE"
          title="Ojoro works best with the friends you already move with."
          accessibilityLabel="Bring your people"
          actions={
            <Button variant="secondary" onPress={() => void onInvite()} testID="invite-friends">
              INVITE FRIENDS
            </Button>
          }
        />

        {/* A bit further out */}
        {further.isPending && density.has_area ? (
          <View {...loadingProps('Loading plans a bit further out')}>
            <Skeleton kind="strip" />
            <Skeleton kind="strip" />
          </View>
        ) : furtherRows.length > 0 ? (
          <View className="gap-space-1" role="region" aria-label="A bit further out" testID="further-out">
            <Divider label="A BIT FURTHER OUT" />
            {furtherRows.map((r) => {
              const s = furtherStrip(r);
              const target = furtherTarget(r);
              return (
                <ActivityStrip
                  key={`${r.kind}-${r.plan_id}`}
                  {...s}
                  onPress={() => {
                    track('further_out_opened', { kind: r.kind, sport: r.sport_id ?? null, plan_id: r.plan_id });
                    router.push(target.kind === 'activity' ? routes.activity(target.id) : routes.plan(target.id));
                  }}
                />
              );
            })}
          </View>
        ) : further.isError && !further.data ? (
          <View className="gap-space-1">
            <Text variant="body-sm" muted>
              {errorMessage(ojoroErrorOf(further.error))}
            </Text>
            <TextButton onPress={() => void further.refetch()} className="self-start">
              TRY AGAIN
            </TextButton>
          </View>
        ) : null}

        <FeedEnd size="sm" title="THAT'S EVERYTHING." message="Start something and it'll be here tomorrow." testID="feed-end" />
      </View>

      {!online ? (
        <OfflineBanner at={asOf} message={asOf ? undefined : "Offline. We'll load this when you're back."} />
      ) : null}

      <DownForSheet
        visible={sheet !== null}
        onClose={() => setSheet(null)}
        initialSportId={sheet?.sportId}
        initialWindowId={sheet?.windowId}
        defaultRadiusKm={density.radius_km ?? undefined}
        source="first_home"
      />
    </Screen>
  );
}
