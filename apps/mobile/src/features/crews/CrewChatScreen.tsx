/**
 * CrewChat (design-handoff/screens/CrewChat.png, calm; the suggestion is forming): the header
 * (back · crew name over "14 members · 4 free tonight" · more), the thread, Make This a Game where
 * the chat formed a plan, and the composer over the bottom safe area.
 * docs/MESSAGING_CONTRACT.md, Screens: CrewChat.
 */
import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button, Icon, IconButton, Screen, Sheet, Skeleton, Text, loadingProps } from '@/design-system';
import { track } from '@/lib/analytics';
import { useUserId } from '@/lib/auth';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';

import { planSubscription } from '@ojoro/contracts';

import { useRealtimeRefetch } from '@/lib/realtime';

import { useOnline } from '../activities/data';
import { planKeys } from '../plans/data';
import { goBack, InlineError } from '../activities/ui';
import { ChatView } from '../chat/ChatView';
import { payloadEvent, type ThreadItem } from '../chat/thread';
import { useChatMessages } from '../chat/useChat';
import { useCrewRealtime, useCrewSuggestions, useCrewView, type Suggestion } from './data';
import { crewCaption, isCrewAdmin } from './logic';
import { CrewPlanPoll, SuggestionCard } from './MakeGame';

export function CrewChatScreen({ id }: { id: string }) {
  const userId = useUserId();
  const online = useOnline();
  useCrewRealtime(id);
  const view = useCrewView(id);
  const crew = view.data ?? null;
  const suggestions = useCrewSuggestions(id, !!crew);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    track('screen_viewed', { screen: 'crew_chat', crew_id: id });
  }, [id]);

  const tz = crew?.time_zone ?? 'America/Toronto';
  const rows = (suggestions.data ?? []).filter((s) => !hidden.has(s.id));
  const open = rows.find((s) => s.status === 'open') ?? null;
  const accepted = rows.find((s) => s.status === 'accepted' && s.plan_id) ?? null;
  // The poll's channel lives here, not in the poll: the poll moves (end of the thread → under the
  // MAKE THIS A GAME line) as pages load, and a remount would drop and re-create the same topic.
  const pollPlanId = accepted?.plan_id ?? null;
  useRealtimeRefetch(pollPlanId ? planSubscription(pollPlanId) : null, [planKeys.all(pollPlanId ?? '')]);
  const hide = (sid: string) => setHidden((h) => new Set([...h, sid]));
  // The same pages ChatView reads (shared cache): is the accepted suggestion's line loaded?
  const thread = useChatMessages('crew', id, !!crew);
  const anchoredIds = useMemo(() => {
    const out = new Set<string>();
    for (const m of thread.messages) {
      const ev = m.kind === 'system' ? payloadEvent(m.payload) : null;
      if (ev?.event === 'make_this_a_game' && ev.suggestion_id) out.add(ev.suggestion_id);
    }
    return out;
  }, [thread.messages]);
  const anchored = (s: Suggestion) => anchoredIds.has(s.id);

  // The accepted suggestion sits where Lena tapped: the card before her line, the poll after it.
  const around = useCallback(
    (item: ThreadItem) => {
      if (!accepted || item.type !== 'system') return null;
      const ev = payloadEvent(item.message.payload);
      if (ev?.event !== 'make_this_a_game' || ev.suggestion_id !== accepted.id) return null;
      return {
        before: <SuggestionCard crewId={id} suggestion={accepted} timeZone={tz} online={online} onHide={() => hide(accepted.id)} />,
        after: <CrewPlanPoll suggestion={accepted} timeZone={tz} />,
      };
    },
    [accepted, id, tz, online],
  );

  const tail = (
    <View className="gap-space-5">
      {accepted && !anchored(accepted) ? (
        <>
          <SuggestionCard crewId={id} suggestion={accepted} timeZone={tz} online={online} onHide={() => hide(accepted.id)} />
          <CrewPlanPoll suggestion={accepted} timeZone={tz} />
        </>
      ) : null}
      {open ? (
        <SuggestionCard crewId={id} suggestion={open} timeZone={tz} online={online} onHide={() => hide(open.id)} />
      ) : null}
    </View>
  );


  return (
    <Screen situation="calm" gutter={false}>
      <CrewHeader
        title={crew?.name ?? null}
        caption={crew ? crewCaption(crew) : null}
        loading={view.isPending}
        onTitle={() => router.push(`/crew/${id}` as Href)}
        onMore={() => setMenu(true)}
      />
      {view.isPending && !crew ? (
        <View className="gap-space-6 px-space-5 pt-space-6" {...loadingProps('Loading the chat')}>
          <Skeleton kind="text" />
          <Skeleton kind="strip" />
        </View>
      ) : !crew ? (
        <CrewUnavailable error={view.error} onRetry={() => void view.refetch()} />
      ) : (
        <ChatView
          kind="crew"
          id={id}
          myId={userId}
          timeZone={tz}
          placeholder={`Message ${crew.name}`}
          canModerate={isCrewAdmin(crew.my_role)}
          around={around}
          tail={rows.length > 0 ? tail : null}
          emptyText="Nothing here yet. Say what you're up for; when a plan forms, Ojoro offers to set it up."
        />
      )}
      <Sheet visible={menu} onClose={() => setMenu(false)} title={crew?.name ?? 'Crew'}>
        <View className="gap-space-2 pb-space-2">
          <Button
            variant="secondary"
            block
            onPress={() => {
              setMenu(false);
              router.push(`/crew/${id}` as Href);
            }}
            testID="crew-menu-page"
          >
            MEMBERS AND INVITE CODE
          </Button>
          <Text variant="caption" muted>
            To report or block someone, press and hold their message, or open their profile from the members list.
          </Text>
        </View>
      </Sheet>
    </Screen>
  );
}

export function CrewHeader({
  title,
  caption,
  loading,
  onTitle,
  onMore,
}: {
  title: string | null;
  caption: string | null;
  loading: boolean;
  onTitle?: () => void;
  onMore?: () => void;
}) {
  return (
    <View className="flex-row items-center gap-space-1 border-b border-line px-space-2 pb-space-2 pt-space-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => goBack('/')}
        className="size-[44px] items-center justify-center"
        testID="header-back"
      >
        <Icon name="back" />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Opens the crew"
        onPress={onTitle}
        className="min-h-touch flex-1 justify-center"
        testID="crew-title"
      >
        {loading && !title ? (
          <View {...loadingProps('Loading the crew')}>
            <Skeleton kind="text" />
          </View>
        ) : (
          <>
            <Text variant="title-sm" accessibilityRole="header" numberOfLines={1}>
              {title ?? 'Crew'}
            </Text>
            {caption ? (
              <Text variant="caption" muted numberOfLines={1} testID="crew-caption">
                {caption}
              </Text>
            ) : null}
          </>
        )}
      </Pressable>
      {onMore ? <IconButton icon="more" label="Crew options" onPress={onMore} testID="header-more" /> : <View className="size-[44px]" />}
    </View>
  );
}

export function CrewUnavailable({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const e = ojoroErrorOf(error);
  const gone = !error || e.code === 'crew_not_found';
  return (
    <View className="gap-space-4 px-space-5 pt-space-8" testID="crew-unavailable">
      {gone ? (
        <>
          <Text variant="title">This crew isn't available.</Text>
          <Text variant="body-sm" muted>
            Crews are private. You see one once you're in it.
          </Text>
          <View className="self-start">
            <Button variant="secondary" onPress={() => router.replace('/crew' as Href)}>
              YOUR CREWS
            </Button>
          </View>
        </>
      ) : (
        <InlineError message={errorMessage(e)} action="RETRY" onAction={onRetry} testID="screen-error" />
      )}
    </View>
  );
}
