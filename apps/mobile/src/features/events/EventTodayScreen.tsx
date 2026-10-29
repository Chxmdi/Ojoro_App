/**
 * EventToday (design-handoff/screens/EventToday.png, confirmed situation): the day of a Challenge
 * Event. The hero (TODAY. / ALMOST TIME.), Ojoro's latest update, both competitors' check-ins, WHO
 * TAKES IT? (still changeable; it locks the moment the race goes live), how the race goes live,
 * and I'M READY for the competitors. When both are ready the server goes live and the stage router
 * swaps in EventLive.
 */
import type { ChallengeSide } from '@ojoro/contracts';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Share, View } from 'react-native';

import {
  Button,
  ChallengeEventHero,
  Divider,
  HypePost,
  Icon,
  IconButton,
  ParticipantRow,
  PredictionBar,
  Screen,
  Text,
  TextButton,
  useToast,
} from '@/design-system';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { useOnline } from '../activities/data';
import { InlineError, OfflineNote } from '../activities/ui';
import { EventHeader, EventMenu, sidesOf } from './EventBuildupScreen';
import {
  useCheckInChallenge,
  useEvent,
  useEventCompetitors,
  useEventFeed,
  usePredict,
  useReady,
  type EventView,
} from './data';
import {
  checkInNote,
  countdownTarget,
  disciplineLabel,
  fromShown,
  hypeView,
  toShown,
  posterShareText,
  posterWhen,
  readyLine,
  serverNow,
  todayDateline,
  todayPredictionNote,
  whenLine,
} from './logic';

export function EventTodayScreen({ eventId }: { eventId: string }) {
  const event = useEvent(eventId);
  const data = event.data ?? null;
  if (!data) return null; // The stage router shows loading and errors before this mounts.
  return (
    <Today
      eventId={eventId}
      row={data.row}
      receivedAt={data.receivedAt}
      dataUpdatedAt={event.dataUpdatedAt}
    />
  );
}

/** "Now" on the server's clock, re-rendered each minute for the header time. */
function useServerMinute(serverNowIso: string, receivedAt: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setTimeout(() => setNow(Date.now()), 60_000 - (Date.now() % 60_000) + 50);
    return () => clearTimeout(t);
  }, [now]);
  return serverNow(serverNowIso, receivedAt, now);
}

function Today({
  eventId,
  row,
  receivedAt,
  dataUpdatedAt,
}: {
  eventId: string;
  row: EventView;
  receivedAt: number;
  dataUpdatedAt: number;
}) {
  const online = useOnline();
  const toast = useToast();
  const sides = sidesOf(row);
  const tz = row.time_zone ?? 'America/Toronto';
  const now = useServerMinute(row.server_now, receivedAt);
  const predict = usePredict(eventId);
  const checkIn = useCheckInChallenge(eventId);
  const ready = useReady(eventId);
  const feed = useEventFeed(eventId);
  const competitors = useEventCompetitors(eventId);
  const checkedAt = (side: ChallengeSide) =>
    competitors.data
      ?.filter((c) => c.side === side && c.checked_in_at)
      .map((c) => c.checked_in_at as string)
      .sort()[0] ?? null;
  const [menu, setMenu] = useState(false);
  const competitor = !!row.is_competitor;
  const mySide = (row.my_side ?? null) as ChallengeSide | null;
  const meIn = mySide === 'a' ? !!row.a_checked_in : mySide === 'b' ? !!row.b_checked_in : false;
  const meReady = mySide === 'a' ? !!row.a_ready : mySide === 'b' ? !!row.b_ready : false;
  const otherReady = mySide === 'a' ? !!row.b_ready : mySide === 'b' ? !!row.a_ready : false;
  const otherName = sides.b; // Yours is shown first.
  const checkInOpen = row.check_in_opens_at ? now >= Date.parse(row.check_in_opens_at) : true;
  const locked = !!row.predictions_locked;
  const pick = toShown(row.my_prediction, sides.o) ?? null;

  // Ojoro's latest update (BOTH ARE HERE.), when there is one.
  const latest = feed.posts.find((p) => p.kind === 'system' && !p.is_deleted && p.body);
  const latestView = latest ? hypeView(latest, sides.stored) : null;

  const share = async () => {
    if (row.audience === 'public') {
      router.push(`/event/${eventId}/poster` as Href);
      return;
    }
    try {
      const result = await Share.share({
        message: posterShareText({
          a: sides.a,
          b: sides.b,
          discipline: disciplineLabel(row),
          when: posterWhen(row.starts_at, tz),
          link: null,
        }),
      });
      if (result.action === Share.sharedAction)
        track('cta_tapped', { cta: 'challenge_shared', event_id: eventId });
    } catch {
      toast.show({ kind: 'error', message: "Sharing isn't available here." });
    }
  };

  const onPick = (shown: ChallengeSide) => {
    const side = fromShown(shown, sides.o);
    if (competitor && mySide && side !== mySide) {
      toast.show({ kind: 'error', message: 'You can only pick yourself.' });
      return;
    }
    predict.mutate(side, {
      onError: (e) => toast.show({ kind: 'error', message: errorMessage(ojoroErrorOf(e)) }),
    });
  };

  const person = (side: ChallengeSide) => {
    const name = side === 'a' ? row.a_name : row.b_name;
    const isIn = side === 'a' ? !!row.a_checked_in : !!row.b_checked_in;
    return (
      <ParticipantRow
        key={side}
        person={{ name }}
        meta={checkInNote({
          me: mySide === side,
          checkedIn: isIn,
          at: checkedAt(side),
          timeZone: tz,
        })}
        trailing={<CheckedIn on={isIn} />}
        trailingLabel={isIn ? 'Checked in' : 'Not checked in yet'}
        rule
        testID={`today-checkin-${side}`}
      />
    );
  };

  return (
    <Screen situation="confirmed" scroll gutter={false}>
      <EventHeader
        title={todayDateline(now, tz)}
        eventId={eventId}
        right={
          <View className="flex-row">
            <IconButton
              icon="share"
              label="Share the event"
              onPress={() => void share()}
              testID="today-share"
            />
            <IconButton
              icon="more"
              label="Event options: report, block, mute"
              onPress={() => setMenu(true)}
              testID="header-more"
            />
          </View>
        }
      />
      <View testID="event-today">
        <ChallengeEventHero
          a={{ name: sides.a, checkedIn: sides.left.checkedIn }}
          b={{ name: sides.b, checkedIn: sides.right.checkedIn }}
          discipline={disciplineLabel(row)}
          stage={row.stage === 'soon' ? 'soon' : 'today'}
          when={whenLine(row.starts_at, tz, row.place_name ?? row.course_note)}
          countdown={{
            label: 'STARTS IN',
            to: countdownTarget(row.starts_at, row.server_now, receivedAt),
          }}
          testID="event-hero"
        />

        <View className="gap-space-8 px-space-5 pb-space-10">
          {!online ? (
            <OfflineNote
              dataUpdatedAt={dataUpdatedAt}
              extra="Check-in, picks and I'M READY wait until you're back."
            />
          ) : null}

          {latest && latestView && !latestView.hidden ? (
            <HypePost
              kind="system"
              body={latestView.body}
              time={clockOf(latest.created_at, tz)}
              testID="today-update"
            />
          ) : null}

          <View role="region" aria-label="Check-in">
            <Divider label="CHECK-IN" />
            <View testID="today-checkins">
              {person(sides.left.side)}
              {person(sides.right.side)}
            </View>
            {competitor && !meIn ? (
              <View className="gap-space-2 pt-space-4">
                <Button
                  variant="secondary"
                  block
                  disabled={!online || !checkInOpen}
                  loading={checkIn.isPending}
                  onPress={() => checkIn.mutate()}
                  testID="today-check-in"
                >
                  CHECK IN
                </Button>
                {!checkInOpen && row.check_in_opens_at ? (
                  <Text variant="caption" muted>
                    {`Check-in opens at ${clockOf(row.check_in_opens_at, tz)}.`}
                  </Text>
                ) : null}
                {checkIn.isError ? (
                  <InlineError message={errorMessage(ojoroErrorOf(checkIn.error))} />
                ) : null}
              </View>
            ) : null}
          </View>

          <View className="gap-space-3" role="region" aria-label="Predictions">
            <PredictionBar
              a={{ name: sides.a.toUpperCase(), pct: sides.left.pct }}
              b={{ name: sides.b.toUpperCase(), pct: sides.right.pct }}
              {...(pick ? { picked: pick } : null)}
              locked={locked}
              {...(online ? { onPick } : null)}
              testID="today-prediction"
            />
            <Text variant="caption" muted testID="today-prediction-note">
              {todayPredictionNote(row.prediction_count ?? 0, locked)}
            </Text>
          </View>

          <View className="gap-space-4" testID="today-ready">
            <Text variant="body">
              {readyLine({ competitor, meReady, otherReady, otherName, checkedIn: meIn })}
            </Text>
            {competitor ? (
              <Button
                variant="commit"
                block
                disabled={!online || !meIn || meReady}
                loading={ready.isPending}
                onPress={() => ready.mutate()}
                accessibilityLabel={meReady ? "You're ready" : "I'm ready"}
                testID="today-ready-button"
              >
                {meReady ? "YOU'RE READY" : "I'M READY"}
              </Button>
            ) : null}
            {ready.isError ? (
              <InlineError message={errorMessage(ojoroErrorOf(ready.error))} />
            ) : null}
          </View>

          <View className="self-start">
            <TextButton
              onPress={() => router.push(`/event/${eventId}?view=buildup` as Href)}
              testID="today-buildup-link"
            >
              THE BUILD-UP
            </TextButton>
          </View>
        </View>
      </View>
      <EventMenu eventId={eventId} row={row} visible={menu} onClose={() => setMenu(false)} />
    </Screen>
  );
}

function clockOf(at: string, tz: string): string {
  return whenLine(at, tz, null);
}

/** CHECKED IN with the circled check, or NOT YET: words, never colour alone. */
function CheckedIn({ on }: { on: boolean }) {
  return (
    <View className="flex-row items-center gap-space-2">
      {on ? <Icon name="check" size={22} /> : <Icon name="clock" size={22} />}
      <Text variant="label">{on ? 'CHECKED IN' : 'NOT YET'}</Text>
    </View>
  );
}
