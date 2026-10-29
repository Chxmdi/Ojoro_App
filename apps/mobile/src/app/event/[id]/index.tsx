import { screenForStage } from '@ojoro/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { Button, Screen, Text } from '@/design-system';
import { goBack, InlineError, LoadingState } from '@/features/activities/ui';
import { EventBuildupScreen, EventHeader } from '@/features/events/EventBuildupScreen';
import { EventLiveScreen } from '@/features/events/EventLiveScreen';
import { EventTodayScreen } from '@/features/events/EventTodayScreen';
import { ResultScreen } from '@/features/events/ResultScreen';
import { VerifyingScreen } from '@/features/events/VerifyingScreen';
import { eventKeys, useEvent, useEventRealtime, type EventView } from '@/features/events/data';
import { calledOffLine, nextStageChange } from '@/features/events/logic';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

/**
 * `/event/[id]`: a Challenge Event at its stage (the server computes it; see the contract's
 * `screenForStage`). accepted/days → EventBuildup, today/soon → EventToday, live → EventLive,
 * verifying/disputed → Verifying, complete → Result, cancelled → called off. Realtime is a refetch
 * hint; time-based stage changes (the day, check-in, the start) refetch at their boundary.
 */
export default function EventRoute() {
  const { id, view } = useLocalSearchParams<{ id: string; view?: string }>();
  return <EventStageRouter key={id} eventId={id} buildup={view === 'buildup'} />;
}

/** `?view=buildup` opens the build-up on the day (EventToday → EventBuildup). */
function EventStageRouter({ eventId, buildup }: { eventId: string; buildup: boolean }) {
  useEventRealtime(eventId);
  const event = useEvent(eventId);
  const qc = useQueryClient();
  const data = event.data ?? null;
  const row = data?.row ?? null;

  useEffect(() => {
    if (!data) return undefined;
    const wait = nextStageChange(data.row, data.receivedAt, Date.now());
    if (wait === null) return undefined;
    const t = setTimeout(
      () => void qc.invalidateQueries({ queryKey: eventKeys.view(eventId) }),
      wait,
    );
    return () => clearTimeout(t);
  }, [data, eventId, qc]);

  useEffect(() => {
    if (row) track('screen_viewed', { screen: `event_${row.stage}`, event_id: eventId });
  }, [row?.stage, eventId]); // eslint-disable-line react-hooks/exhaustive-deps -- once per stage.

  if (!row) {
    return (
      <Screen situation="forming" scroll gutter={false}>
        <EventHeader title="CHALLENGE EVENT" eventId={eventId} />
        {event.isPending ? (
          <LoadingState label="Loading the event" kinds={['object', 'strip', 'strip']} />
        ) : event.isError ? (
          <View className="px-space-5 pt-space-8">
            <InlineError
              message={errorMessage(ojoroErrorOf(event.error))}
              action="RETRY"
              onAction={() => void event.refetch()}
              testID="screen-error"
            />
          </View>
        ) : (
          <EventNotFound />
        )}
      </Screen>
    );
  }

  if (row.stage === 'cancelled') return <EventCalledOff row={row} />;
  switch (screenForStage(row.stage)) {
    case 'EventToday':
      return buildup ? (
        <EventBuildupScreen eventId={eventId} />
      ) : (
        <EventTodayScreen eventId={eventId} />
      );
    case 'EventLive':
      return <EventLiveScreen eventId={eventId} />;
    case 'Verifying':
      return <VerifyingScreen eventId={eventId} />;
    case 'Result':
      return <ResultScreen eventId={eventId} />;
    default:
      return <EventBuildupScreen eventId={eventId} />;
  }
}

/** Not found or not open to the viewer: the server never says which (privacy). */
function EventNotFound() {
  return (
    <View className="gap-space-4 px-space-5 pt-space-8" testID="not-found">
      <Text variant="title">We can't find that event.</Text>
      <Text variant="body-sm" muted>
        It may have been called off, or it isn't open to you.
      </Text>
      <View className="self-start">
        <Button variant="secondary" onPress={() => router.replace('/compete' as never)}>
          BACK TO COMPETE
        </Button>
      </View>
    </View>
  );
}

/** Cancelled (undesigned; docs/DESIGN_DECISIONS.md, Step 5 screens: B). Calm, in words. */
function EventCalledOff({ row }: { row: EventView }) {
  return (
    <Screen situation="calm" scroll gutter={false}>
      <EventHeader title="CHALLENGE EVENT" eventId={row.id} row={row} />
      <View className="gap-space-4 px-space-5 pt-space-6" testID="event-cancelled">
        <Text variant="overline">CALLED OFF</Text>
        <Text variant="title">{`${row.a_name} vs ${row.b_name} isn't happening.`}</Text>
        <Text variant="body" muted>
          {`${calledOffLine(row.cancel_reason)} Nothing was at stake.`}
        </Text>
        <View className="self-start">
          <Button variant="secondary" onPress={() => goBack('/compete' as never)}>
            BACK
          </Button>
        </View>
      </View>
    </Screen>
  );
}
