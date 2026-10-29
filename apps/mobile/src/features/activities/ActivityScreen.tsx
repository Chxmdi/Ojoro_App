/**
 * Activity (design-handoff/screens/Activity.png, calm): the confirmed game. ActivityObject header,
 * details, who's playing, CHECK IN (or when it opens), I CAN'T MAKE IT ANYMORE, the waitlist, and
 * a minimal live state. Step 4 adds links to the live page (while live) and the game chat (people in
 * the game); the design's chat preview isn't drawn, and report and block stay in the overflow
 * (docs/DESIGN_DECISIONS.md, Step 4 screens).
 */
import { checkInWindowState } from '@ojoro/contracts';
import { router, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import {
  ActivityObject,
  Button,
  DisplayText,
  Divider,
  Modal,
  ParticipantList,
  ParticipantRow,
  Screen,
  Text,
} from '@/design-system';
import { track } from '@/lib/analytics';
import { useUserId } from '@/lib/auth';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';
import { useReportBlock } from '@/features/safety';

import { useCheckIn } from '../checkin/hooks';
import {
  timeZoneOf,
  useActivityCard,
  useActivityRealtime,
  useActivityRoster,
  useIntentKey,
  useMeetingPoint,
  useMyArea,
  useNow,
  useOnline,
  usePlace,
} from './data';
import { clock, dateLabel, dayLabel, distanceKm, distanceLabel } from './format';
import {
  activityName,
  canCancel,
  cancelBody,
  checkInCta,
  detailItems,
  finishedLine,
  joinOffer,
  MEETING_POINT_PRIVATE,
  myAttendance,
  overflowLine,
  playingRows,
  ROSTER_PREVIEW,
  statusOf,
  waitlistLine,
  whoTitle,
  type ActivityCard,
} from './model';
import { useCancelAttendance, useHostGameControl, useJoinWaitlist } from './mutations';
import {
  ErrorState,
  InlineError,
  LoadingState,
  MoreButton,
  NotFoundState,
  OfflineNote,
  PrivacyNote,
  QueuedNote,
  ScreenHeader,
} from './ui';

export function ActivityScreen({ id }: { id: string }) {
  const userId = useUserId();
  const now = useNow();
  const online = useOnline();
  useActivityRealtime(id);

  const cardQ = useActivityCard(id);
  const card = cardQ.data ?? null;
  const rosterQ = useActivityRoster(id, !!card);
  const placeQ = usePlace(id, card?.place_id);
  const meetingQ = useMeetingPoint(id, card?.plan_id);
  const areaQ = useMyArea(id, userId);
  const tz = timeZoneOf(placeQ.data);
  const reportBlock = useReportBlock({ onBlocked: () => router.replace('/') });

  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (card && opened.current !== card.id) {
      opened.current = card.id;
      track('activity_opened', { activity_id: card.id, status: card.effective_status ?? card.status });
    }
  }, [card]);

  const roster = rosterQ.data ?? [];
  const host = roster.find((r) => r.is_host);

  return (
    <Screen situation="calm" scroll gutter={false}>
      <ScreenHeader
        overline="ACTIVITY"
        right={
          card ? (
            <MoreButton
              label="Report or block"
              onPress={() =>
                reportBlock.open({
                  subjectKind: 'activity',
                  subjectId: card.id,
                  personName: host?.display_name ?? 'the host',
                  ...(card.host_id !== userId ? { personId: card.host_id } : null),
                })
              }
            />
          ) : undefined
        }
      />
      {cardQ.isPending ? (
        <LoadingState label="Loading the game" kinds={['object', 'text', 'strip', 'strip']} />
      ) : !card ? (
        cardQ.isError ? (
          <ErrorState error={cardQ.error} onRetry={() => void cardQ.refetch()} />
        ) : (
          <NotFoundState />
        )
      ) : (
        <ActivityBody
          card={card}
          now={now}
          tz={tz}
          online={online}
          dataUpdatedAt={cardQ.dataUpdatedAt}
          roster={roster}
          rosterLoading={rosterQ.isPending}
          meetingPoint={meetingQ.data ?? null}
          distance={
            placeQ.data && areaQ.data?.area_lat != null && areaQ.data.area_lng != null
              ? distanceLabel(
                  distanceKm({ lat: areaQ.data.area_lat, lng: areaQ.data.area_lng }, placeQ.data),
                )
              : undefined
          }
          isHost={card.host_id === userId}
        />
      )}
      {reportBlock.sheet}
    </Screen>
  );
}

type BodyProps = {
  card: ActivityCard;
  now: Date;
  tz: string;
  online: boolean;
  dataUpdatedAt: number;
  roster: ReturnType<typeof useActivityRoster>['data'] & object;
  rosterLoading: boolean;
  meetingPoint: { label: string } | null;
  distance: string | undefined;
  isHost: boolean;
};

function ActivityBody({
  card,
  now,
  tz,
  online,
  dataUpdatedAt,
  roster,
  rosterLoading,
  meetingPoint,
  distance,
  isHost,
}: BodyProps) {
  const status = statusOf(card, now);
  const me = myAttendance(card);
  const rows = playingRows(card, roster);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? rows : rows.slice(0, ROSTER_PREVIEW);
  const rest = showAll ? [] : rows.slice(ROSTER_PREVIEW);
  const overflow = overflowLine(rest, card.waitlist_count);
  const people = rows.map((r) => ({ name: r.name }));
  const inGame = me === 'player' || me === 'checked-in' || isHost;
  const details = detailItems(card, inGame ? (meetingPoint?.label ?? null) : null);
  const waitlisted = isHost ? roster.filter((r) => r.status === 'waitlisted') : [];

  return (
    <View testID="activity-screen">
      {!online ? (
        <View className="px-space-5 pt-space-3">
          <OfflineNote dataUpdatedAt={dataUpdatedAt} />
        </View>
      ) : null}

      <View className="pt-space-2">
        {status === 'confirmed' || status === 'live' ? (
          <ActivityObject
            activity={activityName(card)}
            day={dayLabel(card.starts_at, now, tz)}
            time={clock(card.starts_at, tz)}
            place={card.place_name ?? 'Place to be agreed'}
            distance={distance}
            level={card.level_label ?? undefined}
            count={card.confirmed_count}
            capacity={card.capacity}
            people={people}
            status={status}
            details={false}
          />
        ) : (
          <FinishedHeader card={card} status={status} tz={tz} />
        )}
      </View>

      <View className="gap-space-10 px-space-5 pb-space-8 pt-space-6">
        <View accessibilityLabel="Details" className="flex-row flex-wrap gap-y-space-5">
          {details.map((d) => (
            <View key={d.label} className="w-1/2 gap-space-1 pr-space-4">
              <Text variant="label" muted>
                {d.label}
              </Text>
              <Text variant="body-sm">{d.value}</Text>
            </View>
          ))}
          {!inGame ? (
            <View className="w-full">
              <PrivacyNote>{MEETING_POINT_PRIVATE}</PrivacyNote>
            </View>
          ) : null}
        </View>

        <View accessibilityLabel="Who's playing" className="gap-space-2">
          <Divider label={whoTitle(card)} />
          {rosterLoading ? (
            <LoadingState label="Loading who's playing" kinds={['strip', 'strip']} />
          ) : rows.length === 0 ? (
            <Text variant="body-sm" muted testID="roster-empty">
              Nobody is confirmed right now.
            </Text>
          ) : (
            <ParticipantList>
              {shown.map((r) => (
                <ParticipantRow
                  key={r.userId}
                  person={{ name: r.name }}
                  role={r.role}
                  meta={r.meta}
                  testID={`player-${r.userId}`}
                />
              ))}
            </ParticipantList>
          )}
          {overflow ? (
            rest.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityHint="Shows everyone who's playing"
                onPress={() => setShowAll(true)}
                className="min-h-touch justify-center"
              >
                <Text variant="body-sm" muted>
                  {overflow}
                </Text>
              </Pressable>
            ) : (
              <Text variant="body-sm" muted>
                {overflow}
              </Text>
            )
          ) : null}
          {waitlisted.length > 0 ? (
            <View className="gap-space-2 pt-space-4">
              <Divider label={`WAITLIST · ${waitlisted.length}`} />
              <ParticipantList>
                {waitlisted.map((r, i) => (
                  <ParticipantRow
                    key={r.user_id}
                    person={{ name: r.display_name ?? 'Someone' }}
                    avatarSize="sm"
                    meta={`${i + 1} on the waitlist`}
                    trailing={null}
                  />
                ))}
              </ParticipantList>
            </View>
          ) : null}
        </View>

        <GameLinks id={card.id} status={status} inGame={inGame} />

        <ActionSection card={card} now={now} tz={tz} online={online} isHost={isHost} status={status} me={me} />
      </View>
    </View>
  );
}

/** Step 4: the live page while the game is on, and the game's chat for the people in it. */
function GameLinks({
  id,
  status,
  inGame,
}: {
  id: string;
  status: ReturnType<typeof statusOf>;
  inGame: boolean;
}) {
  const live = status === 'live';
  const chat = inGame && status !== 'cancelled';
  if (!live && !chat) return null;
  return (
    <View className="gap-space-3" testID="game-links">
      {live ? (
        <Button variant="secondary" block href={`/activity/${id}/live` as Href} testID="open-live">
          LIVE SCORE AND UPDATES
        </Button>
      ) : null}
      {chat ? (
        <Button variant="ghost" block href={`/activity/${id}/chat` as Href} testID="open-chat">
          GAME CHAT
        </Button>
      ) : null}
    </View>
  );
}

function FinishedHeader({
  card,
  status,
  tz,
}: {
  card: ActivityCard;
  status: ReturnType<typeof statusOf>;
  tz: string;
}) {
  const headline = status === 'cancelled' ? 'CALLED OFF.' : status === 'after' ? 'FULL TIME.' : 'GAME OVER.';
  return (
    <View className="gap-space-3 px-space-5 pt-space-4" testID="activity-finished">
      <Text variant="overline">{`${activityName(card).toUpperCase()} · ${dateLabel(card.starts_at, tz)}`}</Text>
      <DisplayText size="lg">{headline}</DisplayText>
      <Text variant="body">{finishedLine(card, status, tz)}</Text>
      {status === 'after' ? (
        <Button block onPress={() => router.push(`/activity/${card.id}/after` as Href)}>
          CONFIRM THE SCORE
        </Button>
      ) : status === 'complete' ? (
        <Button block onPress={() => router.push(`/activity/${card.id}/recap` as Href)}>
          SEE THE RECAP
        </Button>
      ) : (
        <Button variant="secondary" block onPress={() => router.push('/')}>
          BACK TO HOME
        </Button>
      )}
    </View>
  );
}

function ActionSection({
  card,
  now,
  tz,
  online,
  isHost,
  status,
  me,
}: {
  card: ActivityCard;
  now: Date;
  tz: string;
  online: boolean;
  isHost: boolean;
  status: ReturnType<typeof statusOf>;
  me: ReturnType<typeof myAttendance>;
}) {
  const cta = checkInCta(card, now, tz);
  const checkIn = useCheckIn(card.id, card.check_in_radius_m, tz, card.check_in_opens_at);
  const cancel = useCancelAttendance(card.id);
  const join = useJoinWaitlist(card.id);
  const control = useHostGameControl(card.id);
  const cancelIntent = useIntentKey();
  const joinIntent = useIntentKey();
  const [confirming, setConfirming] = useState<'cancel' | 'leave-waitlist' | 'full-time' | null>(null);
  const [position, setPosition] = useState<number | null>(null);
  const offer = joinOffer(card, now, tz);

  const doCancel = () => {
    setConfirming(null);
    cancel.mutate(cancelIntent.key(), { onSettled: (_d, e) => cancelIntent.settle(e) });
  };
  const doJoin = () => {
    join.mutate(joinIntent.key(), {
      onSettled: (_d, e) => joinIntent.settle(e),
      onSuccess: (s) => setPosition(s.waitlist_position ?? null),
    });
  };
  const onCheckIn = async () => {
    if (await checkIn.checkIn()) router.push(`/activity/${card.id}/check-in` as Href);
  };

  if (status !== 'confirmed' && status !== 'live') return null;

  const windowState = checkInWindowState(card, now);
  return (
    <View accessibilityLabel="Check in" className="gap-space-2" testID="activity-actions">
      {status === 'live' ? (
        <Text variant="body-sm" testID="live-line">
          {`Live now. Started at ${clock(card.live_at ?? card.starts_at, tz)}, ends at ${clock(card.ends_at, tz)}.`}
        </Text>
      ) : null}

      {cta.kind === 'early' || cta.kind === 'open' ? (
        <>
          <Button
            variant="commit"
            block
            loading={checkIn.pending}
            onPress={() => void onCheckIn()}
            testID="check-in-button"
          >
            CHECK IN
          </Button>
          <Text variant="caption" muted className="text-center" testID="check-in-hint">
            {cta.hint}
          </Text>
          {checkIn.failure ? (
            <InlineError
              message={checkIn.failure.message}
              action={checkIn.failure.action === 'TRY AGAIN' ? 'TRY AGAIN' : null}
              onAction={() => void onCheckIn()}
              testID="check-in-error"
            />
          ) : null}
        </>
      ) : cta.kind === 'done' ? (
        <>
          <Button variant="secondary" block onPress={() => router.push(`/activity/${card.id}/check-in` as Href)} testID="see-arrivals">
            SEE WHO'S HERE
          </Button>
          <Text variant="caption" muted className="text-center">
            {cta.hint}
          </Text>
        </>
      ) : null}

      {isHost && status === 'confirmed' && windowState === 'open' ? (
        <Button
          variant="secondary"
          block
          loading={control.isPending}
          onPress={() => control.mutate('start')}
          testID="start-game"
        >
          START THE GAME
        </Button>
      ) : null}
      {isHost && status === 'live' ? (
        <Button variant="secondary" block onPress={() => setConfirming('full-time')} testID="full-time">
          FULL TIME
        </Button>
      ) : null}
      {control.isError ? <InlineError message={errorMessage(ojoroErrorOf(control.error))} /> : null}

      {canCancel(card, now) && !isHost ? (
        <View className="items-center">
          <View>
            <Button variant="ghost" onPress={() => setConfirming('cancel')} testID="cant-make-it">
              I CAN'T MAKE IT ANYMORE
            </Button>
          </View>
        </View>
      ) : null}

      {me === 'waitlisted' ? (
        <View className="gap-space-3 bg-surface-raised p-space-5" testID="waitlisted">
          <Text variant="title-sm">You're on the waitlist</Text>
          <Text variant="body-sm">{waitlistLine(card, position, now, tz)}</Text>
          <View className="self-start">
            <Button variant="ghost" onPress={() => setConfirming('leave-waitlist')}>
              LEAVE THE WAITLIST
            </Button>
          </View>
        </View>
      ) : null}

      {offer && !isHost ? (
        <View className="gap-space-3 bg-surface-raised p-space-5" testID="join-offer">
          <Text variant="title-sm">{offer.label === 'TAKE THE SPOT' ? 'A spot is open' : 'Join the waitlist'}</Text>
          <Text variant="body-sm">{offer.body}</Text>
          <Button block loading={join.isPending && !join.isPaused} onPress={doJoin} testID="join-waitlist">
            {offer.label}
          </Button>
        </View>
      ) : null}

      {cancel.isPaused ? <QueuedNote what="Dropping out" /> : null}
      {join.isPaused ? <QueuedNote what="Joining" /> : null}
      {cancel.isError ? (
        <InlineError message={errorMessage(ojoroErrorOf(cancel.error))} testID="cancel-error" />
      ) : null}
      {join.isError ? (
        <InlineError
          message={errorMessage(ojoroErrorOf(join.error))}
          action="TRY AGAIN"
          onAction={doJoin}
          testID="join-error"
        />
      ) : null}
      {!online && (cta.kind === 'open' || cta.kind === 'early') ? (
        <Text variant="caption" muted className="text-center">
          Check-in needs a connection, because it checks you're here now.
        </Text>
      ) : null}

      <Modal
        visible={confirming === 'cancel' || confirming === 'leave-waitlist'}
        title={confirming === 'leave-waitlist' ? 'LEAVE THE WAITLIST?' : "CAN'T MAKE IT?"}
        body={
          confirming === 'leave-waitlist'
            ? "You'll lose your place in line. To get back on, you'd join at the end."
            : cancelBody(card, now)
        }
        confirm={confirming === 'leave-waitlist' ? 'LEAVE IT' : "I CAN'T MAKE IT"}
        cancel={confirming === 'leave-waitlist' ? 'STAY ON IT' : 'KEEP MY SPOT'}
        onConfirm={doCancel}
        onCancel={() => setConfirming(null)}
      />
      <Modal
        visible={confirming === 'full-time'}
        title="FULL TIME?"
        body="The game ends now. After opens for 24 hours to confirm the score and add photos. Location sharing stops."
        confirm="FULL TIME"
        cancel="KEEP PLAYING"
        onConfirm={() => {
          setConfirming(null);
          control.mutate('end');
        }}
        onCancel={() => setConfirming(null)}
      />
    </View>
  );
}
