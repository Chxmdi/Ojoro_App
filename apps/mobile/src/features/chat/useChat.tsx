/**
 * One chat thread (crew or activity): pages of messages newest first, the outbox of what you sent
 * (optimistic, one idempotency key per message, queued while offline, TRY AGAIN when it failed),
 * edit and delete. docs/MESSAGING_CONTRACT.md, Chat. Realtime is wired by the screen, which knows
 * the channel; every hint refetches `chatKeys.thread`.
 */
import { isRetryable, MESSAGE_MAX_LENGTH } from '@ojoro/contracts';
import {
  onlineManager,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/errorMessages';
import { newIdempotencyKey } from '@/lib/idempotency';
import { ojoroErrorOf, rpc } from '@/lib/rpc';

import { mergePages, outboxReducer, unsent, type ThreadMessage } from './thread';

export type ThreadKind = 'crew' | 'activity';

export const PAGE_SIZE = 50;

export const chatKeys = {
  /** Everything about one thread's messages. Crew screens keep it under ['crew', id]. */
  thread: (kind: ThreadKind, id: string): QueryKey =>
    kind === 'crew' ? ['crew', id, 'messages'] : ['activity-chat', id, 'messages'],
};

/** Retry reads only when the network dropped. */
function retryNetwork(failures: number, error: unknown): boolean {
  return failures < 2 && isRetryable(ojoroErrorOf(error));
}

async function fetchPage(kind: ThreadKind, id: string, before: string | null): Promise<ThreadMessage[]> {
  const page =
    kind === 'crew'
      ? await rpc('crew_messages', {
          p_crew_id: id,
          p_limit: PAGE_SIZE,
          ...(before ? { p_before: before } : null),
        })
      : await rpc('activity_messages', {
          p_activity_id: id,
          p_limit: PAGE_SIZE,
          ...(before ? { p_before: before } : null),
        });
  return page as unknown as ThreadMessage[];
}

export function useChatMessages(kind: ThreadKind, id: string, enabled = true) {
  const query = useInfiniteQuery({
    queryKey: chatKeys.thread(kind, id),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchPage(kind, id, pageParam),
    getNextPageParam: (last) => (last.length < PAGE_SIZE ? undefined : (last[last.length - 1]?.id ?? undefined)),
    retry: retryNetwork,
    enabled,
  });
  const messages = useMemo(() => mergePages(query.data?.pages ?? []), [query.data]);
  return { ...query, messages };
}

/** How many times a send retries on its own after a dropped connection before it says "Not sent." */
const AUTO_RETRIES = 2;

/**
 * The outbox. `send` queues a message with a fresh key and sends it; while offline it waits and
 * goes on reconnect with the same key, so it posts once. `retry` sends a failed one again with its
 * original key. Items leave once the thread holds their id.
 */
export function useOutbox(kind: ThreadKind, id: string, threadIds: ReadonlySet<string>) {
  const qc = useQueryClient();
  const [outbox, dispatch] = useReducer(outboxReducer, []);
  const inFlight = useRef(new Set<string>());
  const latest = useRef(outbox);
  latest.current = outbox;

  const deliver = useCallback(
    async (key: string) => {
      const item = latest.current.find((o) => o.key === key);
      if (!item || inFlight.current.has(key)) return;
      inFlight.current.add(key);
      try {
        for (let attempt = 0; ; attempt += 1) {
          try {
            const row = await rpc('send_message', {
              p_idempotency_key: item.key,
              p_body: item.body,
              ...(kind === 'crew' ? { p_crew_id: id } : { p_activity_id: id }),
              ...(item.replyTo ? { p_reply_to: item.replyTo } : null),
            });
            dispatch({ type: 'sent', key, id: row.id });
            track('chat_message_sent', { thread: kind, reply: !!item.replyTo, retried: attempt > 0 });
            void qc.invalidateQueries({ queryKey: chatKeys.thread(kind, id) });
            return;
          } catch (thrown) {
            const error = ojoroErrorOf(thrown);
            if (isRetryable(error)) {
              // Offline: leave it waiting; it goes on reconnect with the same key.
              if (!onlineManager.isOnline()) return;
              if (attempt < AUTO_RETRIES) {
                await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
                continue;
              }
              dispatch({ type: 'failed', key, error: 'Not sent. Check your connection and try again.' });
              return;
            }
            dispatch({ type: 'failed', key, error: errorMessage(error) });
            track('chat_message_failed', { thread: kind, code: error.code });
            return;
          }
        }
      } finally {
        inFlight.current.delete(key);
      }
    },
    [kind, id, qc],
  );

  const send = useCallback(
    (body: string, replyTo: string | null) => {
      const key = newIdempotencyKey();
      const item = { type: 'queue' as const, key, body, replyTo, at: new Date().toISOString() };
      dispatch(item);
      latest.current = outboxReducer(latest.current, item);
      if (onlineManager.isOnline()) void deliver(key);
      else track('chat_message_queued', { thread: kind });
    },
    [deliver, kind],
  );

  const retry = useCallback(
    (key: string) => {
      dispatch({ type: 'retry', key });
      latest.current = outboxReducer(latest.current, { type: 'retry', key });
      void deliver(key);
    },
    [deliver],
  );

  // Back online: send what waited, oldest first, each with its own key.
  useEffect(
    () =>
      onlineManager.subscribe((online) => {
        if (!online) return;
        for (const item of unsent(latest.current)) void deliver(item.key);
      }),
    [deliver],
  );

  // The server's copy is in the thread: drop the optimistic one.
  useEffect(() => {
    if (outbox.some((o) => o.id && threadIds.has(o.id))) dispatch({ type: 'prune', ids: threadIds });
  }, [threadIds, outbox]);

  return { outbox, send, retry, waiting: unsent(outbox).length };
}

export function useEditMessage(kind: ThreadKind, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { messageId: string; body: string }) =>
      rpc('edit_message', { p_message_id: v.messageId, p_body: v.body }),
    retry: retryNetwork,
    onSuccess: () => track('chat_message_edited', { thread: kind }),
    onSettled: () => qc.invalidateQueries({ queryKey: chatKeys.thread(kind, id) }),
  });
}

export function useDeleteMessage(kind: ThreadKind, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => rpc('delete_message', { p_message_id: messageId }),
    retry: retryNetwork,
    onSuccess: (_d, _v) => track('chat_message_deleted', { thread: kind }),
    onSettled: () => qc.invalidateQueries({ queryKey: chatKeys.thread(kind, id) }),
  });
}

export { MESSAGE_MAX_LENGTH };
