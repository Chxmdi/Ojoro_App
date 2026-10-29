/**
 * `/activity/[id]/chat` (not designed; built from CrewChat's components): the game's chat for the
 * people in it (confirmed, checked in, the host) until the game is complete or cancelled, when it
 * stays readable and the composer says it's closed. Followers and the waitlist get a privacy
 * state. docs/MESSAGING_CONTRACT.md, Chat.
 */
import { activityChatSubscription } from '@ojoro/contracts';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { Button, Screen, Text } from '@/design-system';
import { track } from '@/lib/analytics';
import { useUserId } from '@/lib/auth';
import { errorMessage } from '@/lib/errorMessages';
import { useRealtimeRefetch } from '@/lib/realtime';
import { ojoroErrorOf } from '@/lib/rpc';

import { timeZoneOf, useActivityCard, useNow, usePlace } from '../activities/data';
import { clock, dayLabel } from '../activities/format';
import { activityName, statusOf } from '../activities/model';
import { InlineError } from '../activities/ui';
import { CrewHeader } from '../crews/CrewChatScreen';
import { ChatView } from './ChatView';
import { chatKeys } from './useChat';

/** The composer's closed sentence, or null while the chat is open. */
export function closedReasonFor(status: string): string | null {
  if (status === 'complete') return "This game's chat is closed. It stays here to read.";
  if (status === 'cancelled') return 'This game was called off, so its chat is closed.';
  return null;
}

export function ActivityChatScreen({ id }: { id: string }) {
  const userId = useUserId();
  const now = useNow(60_000);
  useRealtimeRefetch(id ? activityChatSubscription(id) : null, [chatKeys.thread('activity', id)]);
  const cardQ = useActivityCard(id);
  const card = cardQ.data ?? null;
  const place = usePlace(id, card?.place_id);
  const tz = timeZoneOf(place.data);
  const status = card ? statusOf(card, now) : 'confirmed';

  useEffect(() => {
    track('screen_viewed', { screen: 'activity_chat', activity_id: id });
  }, [id]);

  return (
    <Screen situation="calm" gutter={false}>
      <CrewHeader
        title={card ? activityName(card) : null}
        caption={card ? `Game chat · ${dayLabel(card.starts_at, now, tz)} ${clock(card.starts_at, tz)}` : null}
        loading={cardQ.isPending}
        onTitle={() => router.push(`/activity/${id}` as Href)}
      />
      <ChatView
        kind="activity"
        id={id}
        myId={userId}
        timeZone={tz}
        placeholder="Message the game"
        canModerate={!!card && card.host_id === userId}
        closedReason={closedReasonFor(status)}
        emptyText="Nothing here yet. Only people in the game see this chat."
        renderError={(error, retry) => <ActivityChatError error={error} onRetry={retry} id={id} />}
      />
    </Screen>
  );
}

function ActivityChatError({ error, onRetry, id }: { error: unknown; onRetry: () => void; id: string }) {
  const e = ojoroErrorOf(error);
  if (e.code === 'not_attending' || e.code === 'activity_not_found') {
    return (
      <View className="gap-space-4 px-space-5 pt-space-8" testID="chat-private">
        <Text variant="title">This chat is for people in the game.</Text>
        <Text variant="body-sm" muted>
          Players and the host talk here. Followers see the score and updates on the live page.
        </Text>
        <View className="self-start">
          <Button variant="secondary" onPress={() => router.replace(`/activity/${id}` as Href)}>
            SEE THE GAME
          </Button>
        </View>
      </View>
    );
  }
  return (
    <View className="px-space-5 pt-space-8">
      <InlineError message={errorMessage(e)} action="RETRY" onAction={onRetry} testID="chat-error" />
    </View>
  );
}
