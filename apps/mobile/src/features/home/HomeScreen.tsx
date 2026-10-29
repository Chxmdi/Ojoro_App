/**
 * Home (Main.png). Step 4: the Ojoro Daily headline (TONIGHT.) and Down For lead, then the ranked,
 * finite action feed from `home_feed()` (needs you, your plans, your crews, plans forming near you,
 * your last recap), ending with YOU'RE CAUGHT UP. The bell in the header is `unread_count()`.
 * Challenge Events (M6) and CrewMomentum (step 6) are not built. A quiet area
 * (`home_density().low_density`) gets FirstHome instead.
 */
import type { NotificationRow as NotificationFacts } from '@ojoro/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import {
  ActivityStrip,
  Button,
  Divider,
  DownFor,
  FeedEnd,
  loadingProps,
  NotificationRow,
  Panel,
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

import { AreaPrompt } from '../area/AreaPrompt';
import { useCreateDownFor, useMySignals, useSports, useWithdrawDownFor } from '../downfor/data';
import { DownForSheet } from '../downfor/DownForSheet';
import { signalLine, tonightArgs, type WindowId } from '../downfor/logic';
import { useNotificationPrefs, useNotifications } from '../notifications/data';
import { UpdateRow, useRowActions, type RowActions } from '../notifications/UpdateRow';
import { useImDown, useMyArea, useNow, useOnline, usePlanRoster, type PlanCard } from '../plans/data';
import { AsOf, ErrorState, OfflineBanner, routes } from '../plans/parts';
import { clock, DEFAULT_TIME_ZONE, dailyDate, planWhen } from '../plans/time';
import {
  useDownsNearby,
  useFeedPlans,
  useHomeDensity,
  useHomeFeed,
  useHomeRealtime,
  usePlansNearby,
  useRecap,
} from './data';
import { FirstHome } from './FirstHome';
import {
  bestMove,
  cardToNearby,
  crewSuggestionLine,
  dailyBody,
  dailyHeadline,
  downForWhen,
  downForWhere,
  feedDownFor,
  feedSections,
  formingLink,
  isLiveCard,
  peopleDown,
  planForSport,
  recapHeadline,
  recapLine,
  recapWhen,
  sectionLabel,
  type FeedCard,
  type NearbyPlan,
} from './homeLogic';
import { HomeHeader } from './HomeHeader';
import { HomePlan } from './HomePlan';
import { QuickDownFor } from './QuickDownFor';

const TZ = DEFAULT_TIME_ZONE;

type SheetPreset = { sportId: string | null; windowId?: WindowId };

/**
 * Home: FirstHome when the area is quiet (`home_density().low_density`), else the Main feed. While
 * the density is unknown the Main skeleton shows; if it can't be read, Main (which has its own
 * states) is the honest fallback.
 */
export function HomeScreen() {
  const density = useHomeDensity();
  const row = density.data;
  if (density.isPending) return <HomeSkeleton />;
  if (row?.low_density) return <FirstHome density={row} densityUpdatedAt={density.dataUpdatedAt} />;
  return <MainHome hasArea={row ? row.has_area : true} />;
}

function HomeSkeleton() {
  return (
    <Screen situation="calm" scroll gutter={false}>
      <View className="gap-space-6 px-space-5 pt-space-12" {...loadingProps('Loading Home')}>
        <Skeleton kind="text" lines={3} />
        <Skeleton kind="object" />
      </View>
    </Screen>
  );
}

function MainHome({ hasArea }: { hasArea: boolean }) {
  const auth = useAuth();
  const userId = auth.status === 'signed-in' ? auth.session.user.id : null;
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const online = useOnline();
  const now = useNow([]);

  const feed = useHomeFeed(userId !== null);
  const downs = useDownsNearby();
  const nearby = usePlansNearby();
  const signals = useMySignals(userId);
  const sports = useSports();
  const area = useMyArea(userId);
  const notes = useNotifications(userId !== null);
  const prefs = useNotificationPrefs();
  const create = useCreateDownFor();
  const withdraw = useWithdrawDownFor();
  const rowActions = useRowActions('home');
  useHomeRealtime(userId);
  const [sheet, setSheet] = useState<SheetPreset | null>(null);

  useFocusEffect(
    useCallback(() => {
      void qc.invalidateQueries({ queryKey: ['home'] });
    }, [qc]),
  );

  const cards = feed.data ?? [];
  const { sections, end } = feedSections(cards);
  const planIds = cards
    .filter((c) => c.card === 'your_plan' && c.plan_id && !isLiveCard(c))
    .map((c) => c.plan_id as string);
  const plans = useFeedPlans(planIds);

  const sportName = (id: string) => sports.data?.find((s) => s.id === id)?.name ?? id;
  const downRows = downs.data ?? [];
  const nearbyRows = (nearby.data ?? []) as NearbyPlan[];
  const mySignal = signals.data?.[0] ?? null;
  const downCard = cards.find((c) => c.card === 'down_for') ?? null;
  const pick = feedDownFor(downCard, mySignal?.sport_id ?? null, downRows, nearbyRows);
  const pickPlan = pick ? planForSport(nearbyRows, pick.sportId) : null;
  const best = bestMove(nearbyRows, now, TZ);
  const committed = pick ? (signals.data ?? []).some((s) => s.sport_id === pick.sportId) : false;
  const tz = prefs.data?.time_zone ?? TZ;

  const dailyLoading = downs.isPending && nearby.isPending;
  const feedLoading = feed.isPending;
  const failed = feed.isError && !feed.data;
  const quiet = !feedLoading && !failed && sections.length === 0 && !pick;
  const asOf = updatedAt(Math.max(feed.dataUpdatedAt, downs.dataUpdatedAt, nearby.dataUpdatedAt));
  const noteById = new Map((notes.data ?? []).map((n) => [n.id, n]));

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

  const openCard = (c: FeedCard) => {
    if (!c.href) return;
    track('home_card_opened', { card: c.card, position: c.position });
    router.push(c.href as Href);
  };

  return (
    <Screen situation="calm" scroll gutter={false}>
      <HomeHeader />

      <View className="gap-space-10 px-space-5 pb-space-10 pt-space-4" testID="home-feed">
        <AreaPrompt userId={userId} show={!hasArea} />
        {/* Ojoro Daily */}
        <View className="gap-space-3" role="region" aria-label="Ojoro Daily">
          <Text variant="overline">{`OJORO DAILY · ${dailyDate(now, TZ)}`}</Text>
          <Text variant="display-xl" role="heading">
            {dailyHeadline(now, TZ)}
          </Text>
          {dailyLoading ? (
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

        {/* Down For: the sport home_feed ranked, under the editorial as in the design. */}
        {pick ? (
          <View className="gap-space-3" role="region" aria-label="Down for" testID="home-down-for">
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
        ) : !dailyLoading && !feedLoading ? (
          <QuickDownFor
            sports={(sports.data ?? []).map((sp) => ({ id: sp.id, name: sp.name }))}
            downFor={(signals.data ?? []).map((sg) => sg.sport_id)}
            radiusKm={area.data?.discovery_radius_km}
            onSomethingElse={() => setSheet({ sportId: null })}
            source="home"
          />
        ) : null}

        {failed ? (
          <View className="-mx-space-5">
            <ErrorState error={ojoroErrorOf(feed.error)} onRetry={() => void qc.invalidateQueries({ queryKey: ['home'] })} />
          </View>
        ) : null}

        {feedLoading ? (
          <View className="gap-space-4" {...loadingProps('Loading your feed')}>
            <Skeleton kind="strip" />
            <Skeleton kind="object" />
          </View>
        ) : null}

        {/* The action feed, in rank order. */}
        {sections.map((section) => {
          if (section.kind === 'down_for') return null;
          const label = sectionLabel(section.kind);
          return (
            <View
              key={`${section.kind}-${section.cards[0]?.position ?? 0}`}
              className="gap-space-4"
              role="region"
              aria-label={label ?? section.kind}
              testID={`feed-${section.kind}`}
            >
              {label ? <Divider label={label} kind={section.kind === 'needs_you' ? 'strong' : 'hair'} /> : null}
              {section.cards.map((c) => (
                <FeedCardView
                  key={`${c.card}-${c.position}`}
                  card={c}
                  now={now}
                  timeZone={tz}
                  note={c.notification_id ? (noteById.get(c.notification_id) ?? null) : null}
                  plan={plans.data?.find((p) => p.id === c.plan_id) ?? null}
                  rowActions={rowActions}
                  onOpen={() => openCard(c)}
                />
              ))}
            </View>
          );
        })}

        {/* End of feed */}
        {!feedLoading && !failed ? (
          <FeedEnd
            testID="feed-end"
            title={quiet ? "THAT'S EVERYTHING." : (end?.title ?? "YOU'RE CAUGHT UP.")}
            message={quiet ? "Start something and it'll be here tomorrow." : (end?.reason ?? 'Go do something.')}
          />
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

/** One feed card, drawn by kind with its participation action. */
function FeedCardView({
  card,
  now,
  timeZone,
  note,
  plan,
  rowActions,
  onOpen,
}: {
  card: FeedCard;
  now: Date;
  timeZone: string;
  note: NotificationFacts | null;
  plan: PlanCard | null;
  rowActions: RowActions;
  onOpen: () => void;
}) {
  switch (card.card) {
    case 'needs_you':
      // The same row as Updates (icon, time, inline action); the card's words if the row isn't loaded yet.
      return note ? (
        <View testID={`feed-card-${card.position}`}>
          <UpdateRow row={note} now={now} timeZone={timeZone} unread={!note.read_at} actions={rowActions} />
        </View>
      ) : (
        <View testID={`feed-card-${card.position}`}>
          <NotificationRow title={card.title} body={card.reason ?? undefined} icon="bell" tone="strong" onPress={onOpen} />
        </View>
      );
    case 'your_plan':
      if (isLiveCard(card) || !plan) {
        return (
          <View testID={`feed-card-${card.position}`}>
            <ActivityStrip
              activity={card.title}
              time={card.starts_at ? clock(card.starts_at, timeZone) : ''}
              place={card.place_name ?? 'Place to be agreed'}
              {...(card.member_count !== null ? { count: card.member_count } : null)}
              {...(card.capacity !== null ? { capacity: card.capacity } : null)}
              status={isLiveCard(card) ? 'live' : 'forming'}
              onPress={onOpen}
            />
          </View>
        );
      }
      return (
        <View testID={`feed-card-${card.position}`}>
          <HomePlan plan={plan} now={now} joined />
        </View>
      );
    case 'crew_suggestion':
      return (
        <View testID={`feed-card-${card.position}`}>
          <Panel
            overline="OJORO NOTICED A PLAN"
            title={card.title}
            body={crewSuggestionLine(card)}
            actions={
              <Button variant="secondary" compact onPress={onOpen} accessibilityLabel={`Open the chat: ${card.title}`}>
                OPEN THE CHAT
              </Button>
            }
          />
        </View>
      );
    case 'crew_plan':
    case 'plan_forming': {
      const p = cardToNearby(card);
      return p ? (
        <View testID={`feed-card-${card.position}`}>
          <NearbyPlanObject plan={p} now={now} reason={card.card === 'plan_forming' ? card.reason : null} />
        </View>
      ) : null;
    }
    case 'recap':
      return <RecapCard card={card} now={now} timeZone={timeZone} onOpen={onOpen} />;
    default:
      return null;
  }
}

/** Your last game (LAST THURSDAY): the recap object in the after situation. RUN IT BACK lives on the recap. */
function RecapCard({ card, now, timeZone, onOpen }: { card: FeedCard; now: Date; timeZone: string; onOpen: () => void }) {
  const recap = useRecap(card.activity_id);
  const r = recap.data ?? null;
  return (
    <View className="gap-space-4" testID="home-recap-block">
      <Divider label={recapWhen(card.starts_at ?? new Date().toISOString(), now, timeZone)} />
      <Pressable role="link" accessibilityHint="Opens the recap" onPress={onOpen} testID="home-recap">
        <Situation id="after" className="gap-space-2 p-space-5">
          <Text variant="overline">{`RECAP · ${card.title.toUpperCase()}`}</Text>
          <Text variant="display-md">{r ? recapHeadline(r) : `${card.people ?? ''} PLAYED.`.trim()}</Text>
          <Text variant="body-sm">
            {`${r ? recapLine(r) : `${card.reason ?? ''}.`} `}
            <Text variant="body-sm" style={{ fontWeight: '700' }}>
              Run it back?
            </Text>
          </Text>
        </Situation>
      </Pressable>
    </View>
  );
}

/** A plan forming near you: I'M DOWN joins it here and opens it. */
function NearbyPlanObject({ plan, now, reason }: { plan: NearbyPlan; now: Date; reason?: string | null }) {
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
      {reason ? (
        <Text variant="body-sm" muted className="mx-space-5 pt-space-2">
          {`${reason.charAt(0).toUpperCase()}${reason.slice(1)}.`}
        </Text>
      ) : null}
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
