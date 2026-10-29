/**
 * Pure rules for a chat thread (CrewChat and the activity chat): the server's pages turned into
 * rows to draw (time notices between gaps, Ojoro's system lines, collapsed hidden runs, grouping),
 * and the outbox of messages you sent that the server hasn't returned yet.
 * docs/MESSAGING_CONTRACT.md, Chat. No React Native imports.
 */
import { isGrouped, type ChatReply } from '../../design-system/components/ChatMessage.logic';
import { clockWithPeriod, dayDiff, zonedParts } from '../plans/time';

/** A row of `crew_messages` / `activity_messages`. Nullable columns are typed as such (rule 4). */
export type ThreadMessage = {
  id: string;
  sender_id: string | null;
  sender_name: string | null;
  sender_avatar_path?: string | null;
  kind: 'text' | 'system';
  body: string | null;
  reply_to: string | null;
  payload: unknown;
  created_at: string;
  edited_at: string | null;
  is_deleted: boolean;
  is_hidden: boolean;
  is_mine: boolean;
  mentions_me: boolean;
};

/** A message you sent, from tap until the server's copy shows up in the thread. */
export type OutboxItem = {
  /** The idempotency key: one per message, reused on every retry. */
  key: string;
  body: string;
  replyTo: string | null;
  /** sending: on its way (or waiting for a connection) · failed: the server said no, or gave up. */
  status: 'sending' | 'failed';
  /** The server's id once it answered. The item leaves the outbox when the thread holds that id. */
  id: string | null;
  /** When you tapped send (ISO). */
  at: string;
  /** Words for a failure. */
  error?: string | undefined;
};

export type ThreadItem =
  | { type: 'notice'; key: string; text: string }
  | { type: 'system'; key: string; text: string; message: ThreadMessage }
  | { type: 'hidden'; key: string; count: number; text: string }
  | {
      type: 'message';
      key: string;
      message: ThreadMessage;
      author: string;
      fullName: string;
      grouped: boolean;
      replyTo: ChatReply | undefined;
      time: string;
    }
  | { type: 'outbox'; key: string; item: OutboxItem; grouped: boolean; replyTo: ChatReply | undefined };

/** A new time notice when the day changes or the conversation paused this long. */
export const NOTICE_GAP_MS = 30 * 60_000;

/** "Lena R" → "Lena". */
export function firstName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  return trimmed.split(/\s+/)[0] || 'Someone';
}

/** "TODAY · 2:14 PM", "YESTERDAY · 6:02 PM", "TUE · 7:30 PM", "TUE 20 OCT · 7:30 PM". */
export function noticeText(at: string, now: Date, timeZone: string): string {
  const diff = dayDiff(at, now, timeZone);
  const p = zonedParts(at, timeZone);
  const day =
    diff === 0
      ? 'TODAY'
      : diff === -1
        ? 'YESTERDAY'
        : diff > -7 && diff < 0
          ? p.weekday.toUpperCase()
          : `${p.weekday} ${p.day} ${p.monthName}`.toUpperCase();
  return `${day} · ${clockWithPeriod(at, timeZone)}`;
}

/** "1 message hidden" / "3 messages hidden" (blocked people, for the blocker only). */
export function hiddenText(count: number): string {
  return `${count} ${count === 1 ? 'message' : 'messages'} hidden`;
}

/** The system line: "2:20 PM · Lena tapped MAKE THIS A GAME". */
export function systemText(m: ThreadMessage, timeZone: string): string {
  const time = clockWithPeriod(m.created_at, timeZone);
  const event = payloadEvent(m.payload);
  if (event?.event === 'make_this_a_game') {
    return `${time} · ${m.sender_name ? firstName(m.sender_name) : 'Someone'} tapped MAKE THIS A GAME`;
  }
  return `${time} · ${m.body ?? ''}`.trim();
}

/** The facts in a system line's payload, if it is one we know. */
export function payloadEvent(
  payload: unknown,
): { event: string; plan_id?: string | undefined; suggestion_id?: string | undefined } | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.event !== 'string') return null;
  return {
    event: p.event,
    plan_id: typeof p.plan_id === 'string' ? p.plan_id : undefined,
    suggestion_id: typeof p.suggestion_id === 'string' ? p.suggestion_id : undefined,
  };
}

/** Pages arrive newest first; the thread reads oldest first, each message once. */
export function mergePages(pages: readonly (readonly ThreadMessage[])[]): ThreadMessage[] {
  const seen = new Set<string>();
  const out: ThreadMessage[] = [];
  for (const page of pages) {
    for (const m of page) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
  }
  return out.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id));
}

/** The quote for a reply, from the messages loaded so far. */
export function replyQuote(
  replyTo: string | null,
  byId: ReadonlyMap<string, ThreadMessage>,
): ChatReply | undefined {
  if (!replyTo) return undefined;
  const m = byId.get(replyTo);
  if (!m) return { author: 'Earlier message', body: 'Scroll up to see it.' };
  if (m.is_hidden) return { author: 'Hidden', body: 'A message you hid.' };
  if (m.is_deleted) return { author: m.is_mine ? 'You' : firstName(m.sender_name), body: 'Message deleted.' };
  return { author: m.is_mine ? 'You' : firstName(m.sender_name), body: m.body ?? '' };
}

/**
 * The rows to draw, oldest first: a time notice before the first message and after each gap,
 * system lines as notices, runs of hidden messages collapsed into one line, consecutive messages
 * from one person grouped, then your outbox (what you sent that hasn't come back yet).
 */
export function buildThread(
  messages: readonly ThreadMessage[],
  outbox: readonly OutboxItem[],
  now: Date,
  timeZone: string,
  myId: string | null,
): ThreadItem[] {
  const items: ThreadItem[] = [];
  const byId = new Map(messages.map((m) => [m.id, m]));
  let prevAt: number | null = null;
  let prevDayKey: string | null = null;
  let prevAuthor: { authorId: string; at: number; notice?: boolean } | undefined;

  const dayKey = (at: string) => {
    const p = zonedParts(at, timeZone);
    return `${p.year}-${p.month}-${p.day}`;
  };
  const maybeNotice = (at: string, key: string) => {
    const t = Date.parse(at);
    const dk = dayKey(at);
    if (prevAt === null || dk !== prevDayKey || t - prevAt > NOTICE_GAP_MS) {
      items.push({ type: 'notice', key: `notice-${key}`, text: noticeText(at, now, timeZone) });
      prevAuthor = undefined;
    }
    prevAt = t;
    prevDayKey = dk;
  };

  for (const m of messages) {
    maybeNotice(m.created_at, m.id);
    if (m.is_hidden) {
      const last = items[items.length - 1];
      if (last?.type === 'hidden') {
        last.count += 1;
        last.text = hiddenText(last.count);
      } else {
        items.push({ type: 'hidden', key: `hidden-${m.id}`, count: 1, text: hiddenText(1) });
      }
      prevAuthor = undefined;
      continue;
    }
    if (m.kind === 'system') {
      items.push({ type: 'system', key: m.id, text: systemText(m, timeZone), message: m });
      prevAuthor = undefined;
      continue;
    }
    const authorId = m.sender_id ?? 'unknown';
    const cur = { authorId, at: Date.parse(m.created_at) };
    items.push({
      type: 'message',
      key: m.id,
      message: m,
      author: m.is_mine ? 'You' : firstName(m.sender_name),
      fullName: m.sender_name ?? 'Someone',
      grouped: isGrouped(prevAuthor, cur),
      replyTo: replyQuote(m.reply_to, byId),
      time: clockWithPeriod(m.created_at, timeZone),
    });
    prevAuthor = m.is_deleted ? undefined : cur;
  }

  for (const item of pendingOutbox(outbox, byId)) {
    maybeNotice(item.at, item.key);
    const cur = { authorId: myId ?? 'me', at: Date.parse(item.at) };
    items.push({
      type: 'outbox',
      key: `out-${item.key}`,
      item,
      grouped: isGrouped(prevAuthor, cur),
      replyTo: replyQuote(item.replyTo, byId),
    });
    prevAuthor = cur;
  }
  return items;
}

/** Outbox items whose message isn't in the thread yet. */
export function pendingOutbox(
  outbox: readonly OutboxItem[],
  byId: ReadonlyMap<string, unknown>,
): OutboxItem[] {
  return outbox.filter((o) => !(o.id && byId.has(o.id)));
}

// Outbox --------------------------------------------------------------------------------------

export type OutboxAction =
  | { type: 'queue'; key: string; body: string; replyTo: string | null; at: string }
  | { type: 'retry'; key: string }
  | { type: 'sent'; key: string; id: string }
  | { type: 'failed'; key: string; error: string }
  | { type: 'prune'; ids: ReadonlySet<string> };

/** The outbox's state changes. Queue appends; retry flips a failed item back to sending. */
export function outboxReducer(state: readonly OutboxItem[], action: OutboxAction): OutboxItem[] {
  switch (action.type) {
    case 'queue':
      if (state.some((o) => o.key === action.key)) return [...state];
      return [
        ...state,
        { key: action.key, body: action.body, replyTo: action.replyTo, status: 'sending', id: null, at: action.at },
      ];
    case 'retry':
      return state.map((o) => (o.key === action.key ? { ...o, status: 'sending', error: undefined } : o));
    case 'sent':
      return state.map((o) => (o.key === action.key ? { ...o, status: 'sending', id: action.id } : o));
    case 'failed':
      return state.map((o) => (o.key === action.key ? { ...o, status: 'failed', error: action.error } : o));
    case 'prune':
      return state.filter((o) => !(o.id && action.ids.has(o.id)));
  }
}

/** Items still to send: on their way, with no answer from the server yet. */
export function unsent(state: readonly OutboxItem[]): OutboxItem[] {
  return state.filter((o) => o.status === 'sending' && !o.id);
}

/** The composer's note while offline, with the age of what's shown. */
export function offlineLine(asOf: string | null, waiting: number): string {
  const head = asOf ? `Offline. Showing the chat as of ${asOf}.` : 'Offline.';
  const tail =
    waiting > 0
      ? ` ${waiting === 1 ? '1 message is' : `${waiting} messages are`} waiting. They send when you're back.`
      : " Messages you send wait and go when you're back.";
  return head + tail;
}

/** Trimmed text, or the reason it can't be sent (1–max characters). */
export function validateMessage(text: string, max: number): { ok: true; body: string } | { ok: false; error: string } {
  const body = text.trim();
  if (body.length === 0) return { ok: false, error: 'Write something first.' };
  if (body.length > max) return { ok: false, error: `Messages are 1 to ${max.toLocaleString('en-US')} characters.` };
  return { ok: true, body };
}
