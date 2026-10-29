/**
 * Poster (design-handoff/screens/Poster.png, live situation): the 4:5 share poster for an accepted
 * Call-Out. OJORO · CALL-OUT ACCEPTED, the names over a VS rule, the discipline, when and where,
 * and WHO TAKES IT? FOLLOW, PREDICT AND BACK ON OJORO. Only public events have one (§20.2): the
 * server refuses the rest (poster_not_allowed) and the screen says why. Shared as text and a link
 * through the OS sheet; rendering the poster to an image needs a capture library (not added).
 */
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { Share, View, type LayoutChangeEvent, type TextStyle } from 'react-native';

import { Button, Screen, Situation, Text, useToast } from '@/design-system';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { InlineError, LoadingState, PrivacyNote } from '../activities/ui';
import { EventHeader } from './EventBuildupScreen';
import { useEvent, useEventPoster, type EventPoster } from './data';
import { disciplineLabel, posterShareText, posterWhen, sideName } from './logic';

/** The artboard: 540 × 675. Everything scales from its width. */
const ART_W = 540;

export function PosterScreen({ eventId }: { eventId: string }) {
  const poster = useEventPoster(eventId);
  // The poster read has no target ("5K"); the event view (usually cached) does.
  const view = useEvent(eventId).data?.row;
  const target = view?.target ?? null;
  // Your side first (contract rule 9); everyone else sees the challenger first.
  const yoursFirst = view?.my_side === 'b';
  const toast = useToast();
  const row = poster.data ?? null;
  const code = poster.isError ? ojoroErrorOf(poster.error).code : null;

  useEffect(() => {
    track('screen_viewed', { screen: 'event_poster', event_id: eventId });
  }, [eventId]);

  const share = async () => {
    if (!row) return;
    const facts = posterFacts(row, target, yoursFirst);
    try {
      const result = await Share.share({
        message: posterShareText({
          a: facts.a,
          b: facts.b,
          discipline: facts.discipline,
          when: facts.when,
          link: row.link_path ? Linking.createURL(row.link_path) : null,
        }),
      });
      if (result.action === Share.sharedAction)
        track('cta_tapped', { cta: 'challenge_shared', event_id: eventId });
    } catch {
      toast.show({ kind: 'error', message: "Sharing isn't available here." });
    }
  };

  return (
    <Screen situation="calm" scroll gutter={false}>
      <EventHeader title="SHARE POSTER" eventId={eventId} />
      {poster.isPending ? (
        <LoadingState label="Loading the poster" kinds={['object']} />
      ) : code === 'poster_not_allowed' ? (
        <View className="gap-space-4 px-space-5 pt-space-6" testID="poster-private">
          <Text variant="title">No poster for this one.</Text>
          <PrivacyNote>
            Only public events get a share poster. This event is for friends or the people in it, so
            it stays in Ojoro.
          </PrivacyNote>
        </View>
      ) : poster.isError ? (
        <View className="px-space-5 pt-space-6">
          <InlineError
            message={errorMessage(ojoroErrorOf(poster.error))}
            action="RETRY"
            onAction={() => void poster.refetch()}
            testID="screen-error"
          />
        </View>
      ) : !row ? (
        <View className="px-space-5 pt-space-6" testID="not-found">
          <Text variant="title">We can't find that event.</Text>
        </View>
      ) : (
        <View className="gap-space-5 px-space-5 pb-space-10 pt-space-4">
          <PosterArt row={row} target={target} swap={yoursFirst} />
          <Text variant="body-sm" muted>
            Shows the names, the discipline, when and the area. Never who is following, backing or
            predicting.
          </Text>
          <Button block onPress={() => void share()} testID="poster-share">
            SHARE POSTER
          </Button>
        </View>
      )}
    </Screen>
  );
}

function posterFacts(row: EventPoster, target: number | null, swap: boolean) {
  return {
    a: sideName(swap ? row.b_name : row.a_name, false),
    b: sideName(swap ? row.a_name : row.b_name, false),
    discipline: disciplineLabel({
      title: row.title,
      sport_name: row.sport_name,
      target,
      scoring: row.scoring ?? 'score',
      unit: row.unit,
    }),
    when: row.starts_at ? posterWhen(row.starts_at, row.time_zone ?? 'America/Toronto') : '',
    where: [row.place_name, row.place_city].filter(Boolean).join(', '),
  };
}

/** The 4:5 poster, drawn from the artboard's proportions (Poster.png at 540 wide). */
function PosterArt({
  row,
  target,
  swap,
}: {
  row: EventPoster;
  target: number | null;
  swap: boolean;
}) {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);
  const s = w > 0 ? w / ART_W : 0.65;
  const f = posterFacts(row, target, swap);
  const px = (n: number) => Math.round(n * s);
  // Display type never goes under 24pt (design rules).
  const display = (size: number): TextStyle => ({
    fontSize: Math.max(24, px(size)),
    lineHeight: Math.max(24, px(size)) * 0.98,
  });
  const name = (n: string) => n.toUpperCase();
  return (
    <View onLayout={onLayout} style={{ aspectRatio: 4 / 5 }} testID="poster-art">
      <Situation
        id="live"
        role="img"
        accessible
        accessibilityLabel={`${f.a} versus ${f.b}. ${f.discipline}. ${f.when}. ${f.where}. Who takes it? Follow, predict and back on Ojoro.`}
        className="flex-1"
        style={{ paddingHorizontal: px(36), paddingTop: px(36), paddingBottom: px(36) }}
      >
        <View className="flex-row items-center justify-between">
          <Text
            variant="display-xs"
            style={{ fontSize: Math.max(24, px(28)), lineHeight: Math.max(26, px(30)) }}
          >
            OJORO
          </Text>
          <Text variant="label" muted>
            CALL-OUT ACCEPTED
          </Text>
        </View>
        <View className="flex-1 justify-center">
          <Text variant="display-xl" style={display(124)} numberOfLines={1} adjustsFontSizeToFit>
            {name(f.a)}
          </Text>
          <View className="flex-row items-center" style={{ gap: px(14), marginVertical: px(2) }}>
            <View className="flex-1 bg-text" style={{ height: Math.max(2, px(5)) }} />
            <Text variant="display-sm" style={display(40)}>
              VS
            </Text>
            <View className="flex-1 bg-text" style={{ height: Math.max(2, px(5)) }} />
          </View>
          <Text
            variant="display-xl"
            style={[display(124), { textAlign: 'right' }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {name(f.b)}
          </Text>
        </View>
        <View className="border-t border-line" style={{ paddingTop: px(14), gap: px(14) }}>
          <View className="flex-row items-end justify-between" style={{ gap: px(12) }}>
            <Text variant="display-lg" style={display(64)}>
              {f.discipline}
            </Text>
            <View className="shrink items-end">
              <Text variant="title" style={{ textAlign: 'right' }}>
                {f.when}
              </Text>
              {f.where ? (
                <Text variant="body-sm" muted style={{ textAlign: 'right' }}>
                  {f.where}
                </Text>
              ) : null}
            </View>
          </View>
          <Text variant="label">WHO TAKES IT? FOLLOW, PREDICT AND BACK ON OJORO</Text>
        </View>
      </Situation>
    </View>
  );
}
