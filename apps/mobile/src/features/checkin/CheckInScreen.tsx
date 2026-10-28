/**
 * Check-in (design-handoff/screens/CheckIn.png, confirmed): YOU'RE HERE., arrivals with their times
 * (realtime), location sharing for this game only, GO TO THE GAME. Before you've checked in, the
 * same screen asks for your location once and checks you in. LiveActivity is M5, so GO TO THE GAME
 * opens the Activity screen, which shows the live state minimally.
 */
import { checkInWindowState } from '@ojoro/contracts';
import { router, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import {
  Button,
  DisplayText,
  Divider,
  haptics,
  Icon,
  ParticipantList,
  ParticipantRow,
  Progress,
  Screen,
  Text,
  VerificationBadge,
} from '@/design-system';
import { useUserId } from '@/lib/auth';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import {
  timeZoneOf,
  useActivityCard,
  useActivityRealtime,
  useActivityRoster,
  useMeetingPoint,
  useNow,
  useOnline,
  usePlace,
} from '../activities/data';
import { clock, clockWithPeriod } from '../activities/format';
import { myAttendance, statusOf, type ActivityCard, type RosterRow } from '../activities/model';
import { useHostGameControl } from '../activities/mutations';
import {
  ErrorState,
  InlineError,
  LoadingState,
  NotFoundState,
  OfflineNote,
  ScreenHeader,
} from '../activities/ui';
import { openLocationSettings, useCheckIn, useHostCheckIn, useLocationShare } from './hooks';
import {
  arrivals,
  arrivedLine,
  bothCheckedIn,
  nextLine,
  shareCopy,
  shouldBuzzBothCheckedIn,
} from './logic';

export function CheckInScreen({ id }: { id: string }) {
  const now = useNow(15_000);
  useActivityRealtime(id);
  const cardQ = useActivityCard(id);
  const card = cardQ.data ?? null;
  const rosterQ = useActivityRoster(id, !!card);
  const placeQ = usePlace(id, card?.place_id);
  const tz = timeZoneOf(placeQ.data);

  return (
    <Screen situation="confirmed" scroll gutter={false}>
      <ScreenHeader
        overline={`CHECK-IN · ${clockWithPeriod(now, tz)}`}
        fallback={`/activity/${id}` as Href}
      />
      {cardQ.isPending ? (
        <LoadingState label="Loading check-in" kinds={['object', 'strip', 'strip']} />
      ) : !card ? (
        cardQ.isError ? (
          <ErrorState error={cardQ.error} onRetry={() => void cardQ.refetch()} />
        ) : (
          <NotFoundState />
        )
      ) : (
        <CheckInBody
          card={card}
          roster={rosterQ.data ?? []}
          rosterLoading={rosterQ.isPending}
          now={now}
          tz={tz}
          dataUpdatedAt={cardQ.dataUpdatedAt}
        />
      )}
    </Screen>
  );
}

function CheckInBody({
  card,
  roster,
  rosterLoading,
  now,
  tz,
  dataUpdatedAt,
}: {
  card: ActivityCard;
  roster: RosterRow[];
  rosterLoading: boolean;
  now: Date;
  tz: string;
  dataUpdatedAt: number;
}) {
  const userId = useUserId();
  const online = useOnline();
  const me = myAttendance(card);
  const status = statusOf(card, now);
  const isHost = card.host_id === userId;
  const inGame = me === 'player' || me === 'checked-in' || isHost;
  const checkedIn = me === 'checked-in';
  const meeting = useMeetingPoint(card.id, card.plan_id);
  const checkIn = useCheckIn(card.id, card.check_in_radius_m, tz, card.check_in_opens_at);
  const hostCheckIn = useHostCheckIn(card.id);
  const control = useHostGameControl(card.id);
  const sharingAllowed =
    (me === 'player' || me === 'checked-in') && (status === 'confirmed' || status === 'live');
  const share = useLocationShare(card.id, userId, sharingAllowed);

  // The both-checked-in moment: you and the host, on the change only.
  const both = rosterLoading ? null : bothCheckedIn(roster);
  const seen = useRef<boolean | null>(null);
  useEffect(() => {
    if (both === null) return;
    if (shouldBuzzBothCheckedIn(seen.current, both)) void haptics.bothCheckedIn();
    seen.current = both;
  }, [both]);

  const list = arrivals(roster, tz);
  const host = roster.find((r) => r.is_host);
  const window = checkInWindowState(card, now);
  const place = meeting.data?.label ? `${card.place_name ?? 'The pitch'}, ${meeting.data.label}` : card.place_name;

  if (!inGame) {
    return (
      <View className="gap-space-4 px-space-5 pt-space-6" testID="checkin-not-in">
        <DisplayText size="md">NOT IN THIS GAME.</DisplayText>
        <Text variant="body">Check-in is for the people playing. Arrivals and locations stay with them.</Text>
        <Button variant="secondary" block onPress={() => router.push(`/activity/${card.id}` as Href)}>
          BACK TO THE GAME
        </Button>
      </View>
    );
  }

  return (
    <View className="gap-space-8 px-space-5 pb-space-8 pt-space-6" testID="checkin-screen">
      {!online ? <OfflineNote dataUpdatedAt={dataUpdatedAt} extra="Arrivals update when you're back." /> : null}

      <View accessibilityLabel={checkedIn ? "You're checked in" : 'Check in'} className="gap-space-4">
        {checkedIn ? (
          <>
            <VerificationBadge level="checked-in" />
            <DisplayText size="xl" testID="youre-here">
              {"YOU'RE HERE."}
            </DisplayText>
          </>
        ) : (
          <DisplayText size="xl">CHECK IN.</DisplayText>
        )}
        <Text variant="body" testID="arrived-line">
          {arrivedLine(place ?? null, card.checked_in_count, card.confirmed_count)}
        </Text>
        <Progress
          value={card.checked_in_count}
          max={Math.max(card.confirmed_count, 1)}
          label={`${card.checked_in_count} of ${card.confirmed_count} checked in`}
        />
        {!checkedIn && me === 'player' ? (
          <View className="gap-space-2">
            {window === 'open' ? (
              <>
                <Text variant="body-sm">
                  {`We read your location once, to see you're within ${card.check_in_radius_m} m of the pitch. We don't keep it.`}
                </Text>
                <Button
                  block
                  loading={checkIn.pending}
                  onPress={() => void checkIn.checkIn()}
                  testID="check-in-button"
                >
                  CHECK IN
                </Button>
              </>
            ) : (
              <Text variant="body-sm" testID="check-in-hint">
                {window === 'early'
                  ? `Check-in opens at ${clock(card.check_in_opens_at, tz)} when you're within ${card.check_in_radius_m} m of the pitch.`
                  : 'Check-in has closed.'}
              </Text>
            )}
            {checkIn.failure ? (
              <InlineError
                message={checkIn.failure.message}
                action={checkIn.failure.action}
                onAction={
                  checkIn.failure.action === 'OPEN SETTINGS'
                    ? openLocationSettings
                    : () => void checkIn.checkIn()
                }
                testID="check-in-error"
              />
            ) : null}
          </View>
        ) : null}
      </View>

      <View accessibilityLabel="Arrivals" className="gap-space-2">
        <Divider label="ARRIVALS" />
        {rosterLoading ? (
          <LoadingState label="Loading arrivals" kinds={['strip', 'strip']} />
        ) : list.length === 0 ? (
          <Text variant="body-sm" muted>
            Nobody is confirmed for this game.
          </Text>
        ) : (
          <ParticipantList testID="arrivals">
            {list.map((a) => (
              <ParticipantRow
                key={a.userId}
                person={{ name: a.name }}
                role={a.role}
                meta={a.meta}
                {...(isHost && !a.checkedIn && window !== 'early'
                  ? {
                      action: 'CHECK IN',
                      actionLabel: `Confirm ${a.name} is here`,
                      onAction: () => hostCheckIn.mutate(a.userId),
                    }
                  : null)}
                testID={`arrival-${a.userId}`}
              />
            ))}
          </ParticipantList>
        )}
        {hostCheckIn.isError ? <InlineError message={errorMessage(ojoroErrorOf(hostCheckIn.error))} /> : null}
      </View>

      {sharingAllowed ? (
        <View
          accessibilityLabel="Location sharing"
          className="flex-row items-start gap-space-3 bg-surface-raised p-space-4"
          testID="location-sharing"
        >
          <Icon name="pin" size={20} />
          <View className="flex-1 gap-space-2">
            <Text variant="body-sm" testID="share-copy">
              {shareCopy(share.mine, card.ends_at, tz)}
            </Text>
            <View className="self-start">
              {share.mine ? (
                <Button variant="ghost" loading={share.busy} onPress={share.stopSharing} testID="stop-sharing">
                  STOP SHARING
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  loading={share.busy}
                  onPress={() => void share.startSharing()}
                  testID="start-sharing"
                >
                  SHARE MY LOCATION
                </Button>
              )}
            </View>
            {share.problem ? <InlineError message={share.problem} /> : null}
          </View>
        </View>
      ) : null}

      <View accessibilityLabel="Next" className="gap-space-2">
        <Text variant="body-sm" muted>
          {nextLine(host?.display_name ?? null, isHost, status === 'live')}
        </Text>
        {isHost && status === 'confirmed' && window === 'open' ? (
          <Button variant="secondary" block loading={control.isPending} onPress={() => control.mutate('start')}>
            START THE GAME
          </Button>
        ) : null}
        <Button
          variant={checkedIn ? 'primary' : 'secondary'}
          block
          onPress={() => router.push(`/activity/${card.id}` as Href)}
          testID="go-to-game"
        >
          GO TO THE GAME
        </Button>
      </View>
    </View>
  );
}
