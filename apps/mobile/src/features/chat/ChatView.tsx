/**
 * The thread and composer shared by CrewChat and the activity chat: an inverted list (newest at
 * the bottom, older pages load as you scroll up), time notices, grouping, hidden runs, the outbox
 * (Sending… / Not sent. TRY AGAIN), reply and edit, and a long-press (or More options) sheet with
 * reply, edit, delete, and report or block through the safety sheet. Offline it keeps the last
 * thread with its age, and sends wait for the connection.
 */
import { router } from 'expo-router';
import { useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, View, type TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  ChatComposer,
  ChatMessage,
  ChatNotice,
  Icon,
  loadingProps,
  Modal,
  Sheet,
  Skeleton,
  Text,
  TextButton,
  useToast,
} from '@/design-system';
import { overlayGate } from '@/design-system/components/Overlay.logic';
import { replySnippet } from '@/design-system/components/ChatMessage.logic';
import { clockTimeWithPeriod } from '@/lib/age';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { ojoroErrorOf } from '@/lib/rpc';
import { useReportBlock } from '@/features/safety';

import { useOnline } from '../activities/data';
import { InlineError } from '../activities/ui';
import { buildThread, firstName, offlineLine, validateMessage, type ThreadItem, type ThreadMessage } from './thread';
import {
  MESSAGE_MAX_LENGTH,
  useChatMessages,
  useDeleteMessage,
  useEditMessage,
  useOutbox,
  type ThreadKind,
} from './useChat';

/** Runs `fn` once no Sheet or Modal holds the screen, so overlays never stack. */
export function afterOverlay(fn: () => void) {
  if (overlayGate.active() === null) {
    fn();
    return;
  }
  const stop = overlayGate.subscribe(() => {
    if (overlayGate.active() === null) {
      stop();
      fn();
    }
  });
}

export type ChatViewProps = {
  kind: ThreadKind;
  id: string;
  myId: string | null;
  timeZone: string;
  /** "Message Thursday FC". */
  placeholder: string;
  /** Crew owners/admins and the activity host may delete others' messages. */
  canModerate?: boolean | undefined;
  /** Can't post (chat closed, not in the crew): the composer greys out with this sentence. */
  closedReason?: string | null | undefined;
  /** Extra rows inserted into the thread: return nodes to draw before/after an item. */
  around?: ((item: ThreadItem) => { before?: ReactNode; after?: ReactNode } | null) | undefined;
  /** Drawn after the newest message (the open Make This a Game suggestion). */
  tail?: ReactNode | undefined;
  /** Shown when the thread is empty. */
  emptyText: string;
  /** The read failed: shown instead of the thread (privacy, not found). */
  renderError?: ((error: unknown, retry: () => void) => ReactElement) | undefined;
  /** Is the reader allowed in yet (e.g. the crew view loaded)? */
  enabled?: boolean | undefined;
};

type Row =
  | { kind: 'item'; key: string; item: ThreadItem }
  | { kind: 'node'; key: string; node: ReactNode };

export function ChatView({
  kind,
  id,
  myId,
  timeZone,
  placeholder,
  canModerate = false,
  closedReason,
  around,
  tail,
  emptyText,
  renderError,
  enabled = true,
}: ChatViewProps) {
  const online = useOnline();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const thread = useChatMessages(kind, id, enabled);
  const ids = useMemo(() => new Set(thread.messages.map((m) => m.id)), [thread.messages]);
  const outbox = useOutbox(kind, id, ids);
  const edit = useEditMessage(kind, id);
  const del = useDeleteMessage(kind, id);
  const reportBlock = useReportBlock({ onBlocked: () => void thread.refetch() });
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ThreadMessage | null>(null);
  const [editing, setEditing] = useState<ThreadMessage | null>(null);
  const [actionsFor, setActionsFor] = useState<ThreadMessage | null>(null);
  const [deleting, setDeleting] = useState<ThreadMessage | null>(null);
  const [composeError, setComposeError] = useState<string | undefined>(undefined);
  const input = useRef<TextInput>(null);
  // A second tap on send before the field clears posts nothing.
  const lastSend = useRef<{ body: string; at: number } | null>(null);

  const now = new Date();
  const items = useMemo(
    () => buildThread(thread.messages, outbox.outbox, now, timeZone, myId),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `now` only labels days.
    [thread.messages, outbox.outbox, timeZone, myId],
  );

  // Newest first for the inverted list, with the screen's inserts around their anchors.
  const rows = useMemo(() => {
    const out: Row[] = [];
    if (tail) out.push({ kind: 'node', key: 'tail', node: tail });
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const item = items[i]!;
      const extra = around?.(item);
      if (extra?.after) out.push({ kind: 'node', key: `after-${item.key}`, node: extra.after });
      out.push({ kind: 'item', key: item.key, item });
      if (extra?.before) out.push({ kind: 'node', key: `before-${item.key}`, node: extra.before });
    }
    return out;
  }, [items, tail, around]);

  const closed = !!closedReason;
  const submit = (raw: string) => {
    const valid = validateMessage(raw, MESSAGE_MAX_LENGTH);
    if (!valid.ok) {
      setComposeError(valid.error);
      return;
    }
    setComposeError(undefined);
    if (editing) {
      const target = editing;
      edit.mutate(
        { messageId: target.id, body: valid.body },
        {
          onSuccess: () => {
            setEditing(null);
            setText('');
          },
          onError: (e) => setComposeError(errorMessage(ojoroErrorOf(e))),
        },
      );
      return;
    }
    const nowMs = Date.now();
    if (lastSend.current && lastSend.current.body === valid.body && nowMs - lastSend.current.at < 600) return;
    lastSend.current = { body: valid.body, at: nowMs };
    outbox.send(valid.body, replyTo?.id ?? null);
    setText('');
    setReplyTo(null);
  };

  const openActions = (m: ThreadMessage) => {
    track('chat_message_actions_opened', { thread: kind, own: m.is_mine });
    setActionsFor(m);
  };

  const renderItem = ({ item: row }: { item: Row }) => {
    if (row.kind === 'node') return <View style={{ paddingTop: 20 }}>{row.node}</View>;
    const item = row.item;
    switch (item.type) {
      case 'notice':
      case 'hidden':
        return (
          <View style={{ paddingTop: 20 }}>
            <ChatNotice testID={item.type === 'hidden' ? 'chat-hidden' : undefined}>{item.text}</ChatNotice>
          </View>
        );
      case 'system':
        return (
          <View style={{ paddingTop: 20 }}>
            <ChatNotice testID="chat-system">{item.text}</ChatNotice>
          </View>
        );
      case 'message': {
        const m = item.message;
        const body = m.edited_at && !m.is_deleted ? `${m.body ?? ''} (edited)` : (m.body ?? '');
        return (
          <View style={{ paddingTop: 20 }}>
            <ChatMessage
              author={item.author}
              fullName={item.fullName}
              body={body}
              own={m.is_mine}
              grouped={item.grouped}
              time={item.time}
              deleted={m.is_deleted}
              replyTo={item.replyTo}
              onMore={m.is_deleted ? undefined : () => openActions(m)}
              testID={`chat-message-${m.id}`}
            />
          </View>
        );
      }
      case 'outbox':
        return (
          <View style={{ paddingTop: 20 }}>
            <ChatMessage
              author="You"
              body={item.item.body}
              own
              grouped={item.grouped}
              replyTo={item.replyTo}
              status={item.item.status === 'failed' ? 'failed' : 'sending'}
              onRetry={() => outbox.retry(item.item.key)}
              testID={`chat-outbox-${item.item.status}`}
            />
            {item.item.status === 'failed' && item.item.error ? (
              <Text variant="caption" muted className="text-right">
                {item.item.error}
              </Text>
            ) : null}
          </View>
        );
    }
  };

  const loadedOnce = thread.data !== undefined;
  const asOf = thread.dataUpdatedAt > 0 ? clockTimeWithPeriod(new Date(thread.dataUpdatedAt)) : null;

  let body: ReactNode;
  if (!loadedOnce && thread.isPending) {
    body = (
      <View className="flex-1 gap-space-6 px-space-5 pt-space-6" {...loadingProps('Loading the chat')}>
        <Skeleton kind="text" />
        <Skeleton kind="strip" />
        <Skeleton kind="strip" />
      </View>
    );
  } else if (!loadedOnce && thread.isError) {
    body = renderError ? (
      renderError(thread.error, () => void thread.refetch())
    ) : (
      <View className="px-space-5 pt-space-8">
        <InlineError
          message={errorMessage(ojoroErrorOf(thread.error))}
          action="RETRY"
          onAction={() => void thread.refetch()}
          testID="chat-error"
        />
      </View>
    );
  } else {
    body = (
      <FlatList
        inverted
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={renderItem}
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 4 }}
        keyboardShouldPersistTaps="handled"
        onEndReachedThreshold={0.3}
        onEndReached={() => {
          if (thread.hasNextPage && !thread.isFetchingNextPage) {
            track('chat_older_loaded', { thread: kind });
            void thread.fetchNextPage();
          }
        }}
        ListHeaderComponent={<View style={{ height: 20 }} />}
        ListEmptyComponent={
          <View className="items-center px-space-5 py-space-10" testID="chat-empty">
            <Text variant="body-sm" muted className="text-center">
              {emptyText}
            </Text>
          </View>
        }
        ListFooterComponent={
          <View className="items-center pt-space-4" testID="chat-top">
            {thread.isFetchingNextPage ? (
              <View className="w-full" {...loadingProps('Loading earlier messages')}>
                <Skeleton kind="strip" />
              </View>
            ) : thread.hasNextPage ? (
              <TextButton onPress={() => void thread.fetchNextPage()}>LOAD EARLIER MESSAGES</TextButton>
            ) : rows.length > 0 ? (
              <ChatNotice>Start of the chat.</ChatNotice>
            ) : null}
            {thread.isFetchNextPageError ? (
              <Text variant="caption" muted>
                Couldn't load earlier messages.
              </Text>
            ) : null}
          </View>
        }
        testID="chat-thread"
      />
    );
  }

  const banner = editing ? (
    <ComposeBanner label="Editing your message" onCancel={() => {
      setEditing(null);
      setText('');
    }} />
  ) : replyTo ? (
    <ComposeBanner
      label={`Replying to ${replyTo.is_mine ? 'yourself' : firstName(replyTo.sender_name)}: ${replySnippet(replyTo.body ?? '', 60)}`}
      onCancel={() => setReplyTo(null)}
    />
  ) : null;

  const isOwnText = (m: ThreadMessage) => m.is_mine && m.kind === 'text' && !m.is_deleted;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
      {body}
      <View style={{ paddingBottom: insets.bottom }}>
        {!online ? (
          <View
            className="flex-row items-start gap-space-2 px-space-5 pt-space-2"
            accessibilityLiveRegion="polite"
            testID="chat-offline"
          >
            <Icon name="offline" size={16} />
            <Text variant="caption" className="flex-1">
              {offlineLine(asOf, outbox.waiting)}
            </Text>
          </View>
        ) : null}
        {banner}
        <ChatComposer
          ref={input}
          value={text}
          onChangeText={(t) => {
            setText(t);
            if (composeError) setComposeError(undefined);
          }}
          onSend={submit}
          placeholder={placeholder}
          disabled={closed}
          disabledReason={closedReason ?? undefined}
          sending={edit.isPending}
          error={composeError}
          maxLength={MESSAGE_MAX_LENGTH}
          testID="chat-composer"
        />
      </View>

      <Sheet visible={!!actionsFor} onClose={() => setActionsFor(null)} title="Message">
        {actionsFor ? (
          <View className="gap-space-2 pb-space-2">
            {!closed ? (
              <Button
                variant="secondary"
                block
                onPress={() => {
                  setReplyTo(actionsFor);
                  setEditing(null);
                  setActionsFor(null);
                  afterOverlay(() => input.current?.focus());
                }}
                testID="message-reply"
              >
                REPLY
              </Button>
            ) : null}
            {isOwnText(actionsFor) && !closed ? (
              <Button
                variant="secondary"
                block
                onPress={() => {
                  setEditing(actionsFor);
                  setReplyTo(null);
                  setText(actionsFor.body ?? '');
                  setActionsFor(null);
                  afterOverlay(() => input.current?.focus());
                }}
                testID="message-edit"
              >
                EDIT
              </Button>
            ) : null}
            {actionsFor.is_mine || canModerate ? (
              <Button
                variant="secondary"
                block
                onPress={() => {
                  const m = actionsFor;
                  setActionsFor(null);
                  afterOverlay(() => setDeleting(m));
                }}
                testID="message-delete"
              >
                DELETE
              </Button>
            ) : null}
            {!actionsFor.is_mine ? (
              <Button
                variant="secondary"
                block
                onPress={() => {
                  const m = actionsFor;
                  setActionsFor(null);
                  afterOverlay(() =>
                    reportBlock.open({
                      subjectKind: 'message',
                      subjectId: m.id,
                      personName: m.sender_name ?? 'this person',
                      ...(m.sender_id ? { personId: m.sender_id } : null),
                    }),
                  );
                }}
                testID="message-report"
              >
                REPORT OR BLOCK
              </Button>
            ) : null}
            {!actionsFor.is_mine && actionsFor.sender_id ? (
              <Button
                variant="ghost"
                block
                onPress={() => {
                  const sender = actionsFor.sender_id!;
                  setActionsFor(null);
                  router.push(`/profile/${sender}`);
                }}
              >
                SEE THEIR PROFILE
              </Button>
            ) : null}
          </View>
        ) : null}
      </Sheet>

      <Modal
        visible={!!deleting}
        title="DELETE THIS MESSAGE?"
        body={
          deleting?.is_mine
            ? 'The words are removed for everyone. The chat shows that a message was deleted.'
            : 'You are deleting someone else’s message as a moderator. The words are removed for everyone.'
        }
        confirm="DELETE"
        cancel="KEEP IT"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const m = deleting;
          setDeleting(null);
          if (!m) return;
          del.mutate(m.id, {
            onError: (e) => toast.show({ kind: 'error', message: errorMessage(ojoroErrorOf(e)) }),
          });
        }}
      />
      {reportBlock.sheet}
    </KeyboardAvoidingView>
  );
}

function ComposeBanner({ label, onCancel }: { label: string; onCancel: () => void }) {
  return (
    <View className="flex-row items-center gap-space-3 border-t border-line px-space-5 pt-space-2" testID="compose-banner">
      <Text variant="caption" muted className="flex-1" numberOfLines={1}>
        {label}
      </Text>
      <TextButton onPress={onCancel}>CANCEL</TextButton>
    </View>
  );
}
