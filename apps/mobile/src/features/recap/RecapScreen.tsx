/**
 * Recap (design-handoff/screens/Recap.png, after): the poster (LIGHTS WIN 5–4.), the numbers, who
 * you played with, the Passport stamp added, RUN IT BACK and SHARE RECAP. Sharing is the OS share
 * sheet with words only: recaps have no public page in Slice 01.
 */
import { router, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, Share, View } from 'react-native';

import {
  AvatarCluster,
  Button,
  DisplayText,
  Divider,
  IconButton,
  Image,
  PassportStamp,
  Screen,
  Text,
  useToast,
  VerificationBadge,
} from '@/design-system';
import { passportHrefFor } from '@/features/passport/logic';
import { track } from '@/lib/analytics';
import { useUserId } from '@/lib/auth';

import { useMoments } from '../after/data';
import { timeZoneOf, useActivityCard, useActivityRealtime, useNow, useOnline, usePlace } from '../activities/data';
import { dateLabel, shortPlace, stampDate, weekdayHour } from '../activities/format';
import { myAttendance, statusOf, type ActivityCard } from '../activities/model';
import { ErrorState, LoadingState, NotFoundState, OfflineNote, ScreenHeader } from '../activities/ui';
import { useRecap, useRecapForMe, useRecapPeople } from './data';
import {
  hoursLabel,
  passportLine,
  playedWithLine,
  posterOverline,
  recapHeadline,
  resultLine,
  shareText,
  stampTitle,
  type RecapRow,
} from './logic';

export function RecapScreen({ id }: { id: string }) {
  useActivityRealtime(id);
  const now = useNow(60_000);
  const online = useOnline();
  const toast = useToast();
  const cardQ = useActivityCard(id);
  const card = cardQ.data ?? null;
  const placeQ = usePlace(id, card?.place_id);
  const tz = timeZoneOf(placeQ.data);
  const recapQ = useRecap(id);
  const recap = recapQ.data ?? null;

  const viewed = useRef(false);
  useEffect(() => {
    if (recap && !viewed.current) {
      viewed.current = true;
      track('recap_viewed', { activity_id: id, verified: recap.verification_level === 'participant_confirmed' });
    }
  }, [recap, id]);

  const share = async () => {
    if (!card || !recap) return;
    try {
      const result = await Share.share({
        message: shareText({
          headline: recapHeadline(recap),
          sportName: card.sport_name,
          placeName: card.place_name,
          occurredAt: recap.occurred_at,
          played: recap.played_count,
          timeZone: tz,
        }),
      });
      if (result.action === Share.sharedAction) track('recap_shared', { activity_id: id });
    } catch {
      toast.show({ message: "Sharing isn't available on this device.", kind: 'error' });
    }
  };

  const loading = cardQ.isPending || recapQ.isPending;
  return (
    <Screen situation="after" scroll gutter={false}>
      <ScreenHeader
        overline={recap ? `RECAP · ${dateLabel(recap.occurred_at, tz)}` : 'RECAP'}
        fallback="/"
        right={
          recap ? <IconButton icon="share" label="Share recap" onPress={() => void share()} /> : undefined
        }
      />
      {loading ? (
        <LoadingState label="Loading the recap" kinds={['object', 'text', 'strip']} />
      ) : !card ? (
        cardQ.isError ? (
          <ErrorState error={cardQ.error} onRetry={() => void cardQ.refetch()} />
        ) : (
          <NotFoundState />
        )
      ) : (
        <>
          {!online ? (
            <View className="px-space-5 pb-space-3">
              <OfflineNote dataUpdatedAt={recapQ.dataUpdatedAt || cardQ.dataUpdatedAt} />
            </View>
          ) : null}
          {recap ? (
            <RecapBody card={card} recap={recap} tz={tz} now={now} onShare={() => void share()} />
          ) : recapQ.isError ? (
            <ErrorState error={recapQ.error} onRetry={() => void recapQ.refetch()} />
          ) : (
            <NoRecapYet card={card} tz={tz} now={now} />
          )}
        </>
      )}
    </Screen>
  );
}

function NoRecapYet({ card, tz, now }: { card: ActivityCard; tz: string; now: Date }) {
  const status = statusOf(card, now);
  const finished = status === 'after' || status === 'complete';
  return (
    <View className="gap-space-4 px-space-5 pt-space-6" testID="recap-pending">
      <DisplayText size="md">{finished ? 'THE RECAP IS ON ITS WAY.' : 'NO RECAP YET.'}</DisplayText>
      <Text variant="body">
        {finished
          ? `It appears when the players confirm the score, or when After closes at ${weekdayHour(card.after_closes_at, tz)}.`
          : 'The recap appears after the game.'}
      </Text>
      <Button
        variant="secondary"
        block
        onPress={() => router.push((finished ? `/activity/${card.id}/after` : `/activity/${card.id}`) as Href)}
      >
        {finished ? 'BACK TO AFTER' : 'BACK TO THE GAME'}
      </Button>
    </View>
  );
}

function RecapBody({
  card,
  recap,
  tz,
  now,
  onShare,
}: {
  card: ActivityCard;
  recap: RecapRow;
  tz: string;
  now: Date;
  onShare: () => void;
}) {
  const userId = useUserId();
  const me = myAttendance(card);
  const played = me === 'checked-in';
  const inGame = played || me === 'player' || card.host_id === userId;
  const peopleQ = useRecapPeople(card.id, inGame);
  const stampQ = useRecapForMe(card.id, played);
  const momentsQ = useMoments(card.id, userId, inGame);
  const cover = momentsQ.data?.[0];
  const [line1, line2] = recapHeadline(recap);
  const others = (peopleQ.data ?? []).filter((p) => p.user_id !== userId);
  const withLine = playedWithLine(peopleQ.data ?? [], userId);
  const stamp = stampQ.data ?? null;
  const status = statusOf(card, now);
  const verified = recap.verification_level === 'participant_confirmed';

  return (
    <View testID="recap-screen">
      <Image src={cover?.url ?? undefined} alt={cover?.alt ?? `${card.sport_name} at ${card.place_name ?? 'the game'}`} ratio="4:5">
        <Text variant="overline" muted>
          {posterOverline(card.sport_name, card.place_name)}
        </Text>
        <DisplayText size="lg" testID="recap-headline">{`${line1}\n${line2}`}</DisplayText>
      </Image>

      <View className="gap-space-8 px-space-5 pb-space-8 pt-space-6">
        <View accessibilityLabel="The numbers" className="gap-space-4">
          <View className="flex-row gap-space-3">
            <Stat value={String(recap.played_count)} label="Played" />
            <Stat value={String(recap.duration_minutes)} label="Minutes" />
            {stamp ? <Stat value={hoursLabel(stamp.ojoro_hours)} label="Ojoro hours" /> : <View className="flex-1" />}
          </View>
          {verified ? <VerificationBadge level="result" /> : null}
          <Text variant="caption" muted testID="recap-result-line">
            {resultLine(recap)}
          </Text>
        </View>

        {inGame ? (
          <View accessibilityLabel="Played with" className="gap-space-3">
            <Divider label="PLAYED WITH" />
            {peopleQ.isPending ? (
              <LoadingState label="Loading who played" kinds={['text']} />
            ) : others.length === 0 ? (
              <Text variant="body-sm" muted>
                Just you this time.
              </Text>
            ) : (
              <>
                <AvatarCluster
                  people={others.map((p) => ({ name: p.display_name ?? 'Someone' }))}
                  total={others.length}
                  max={7}
                  size="md"
                />
                {withLine ? (
                  <Text variant="body-sm" testID="played-with-line">
                    {withLine}
                  </Text>
                ) : null}
              </>
            )}
          </View>
        ) : null}

        {stamp ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Added to your Passport. ${stampTitle(stamp)}. ${passportLine(stamp, now, tz)}`}
            accessibilityHint="Opens your Passport at this stamp"
            onPress={() => router.push(passportHrefFor(stamp.passport_entry_id ? { entry: stamp.passport_entry_id } : { activity: card.id }) as Href)}
            className="flex-row items-center gap-space-5"
            testID="passport-stamp"
          >
            <PassportStamp
              title={stampTitle(stamp)}
              place={stamp.place_name ? shortPlace(stamp.place_name).toUpperCase() : 'OJORO'}
              date={stampDate(stamp.occurred_at, tz)}
              kind="NEW STAMP"
            />
            <View className="flex-1 gap-space-1">
              <Text variant="label">ADDED TO YOUR PASSPORT</Text>
              <Text variant="body-sm" muted>
                {passportLine(stamp, now, tz)}
              </Text>
            </View>
          </Pressable>
        ) : null}

        <View accessibilityLabel="Next" className="gap-space-2">
          {played && (status === 'after' || status === 'complete') ? (
            <Button
              variant="commit"
              block
              onPress={() => {
                track('run_it_back_tapped', { activity_id: card.id, from: 'recap' });
                router.push(`/activity/${card.id}/run-it-back` as Href);
              }}
              accessibilityHint="Opens a new plan and invites the same people. Nobody is in until they tap I'M DOWN."
              testID="recap-run-it-back"
            >
              RUN IT BACK
            </Button>
          ) : null}
          <View className="items-center">
            <View>
              <Button variant="ghost" onPress={onShare}>
                SHARE RECAP
              </Button>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View className="flex-1" accessible accessibilityLabel={`${value} ${label}`}>
      <Text variant="display-sm">{value}</Text>
      <Text variant="caption" muted>
        {label}
      </Text>
    </View>
  );
}
