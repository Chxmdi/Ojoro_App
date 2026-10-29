/**
 * Pure rules for `ChatMessage`, `ChatNotice` and `ChatComposer` (CrewChat).
 * No React Native imports. Not in the web bundle: the prototype draws the
 * rows inline.
 */

export const CHAT_MESSAGE_STATUSES = ['sent', 'sending', 'failed'] as const;
export type ChatMessageStatus = (typeof CHAT_MESSAGE_STATUSES)[number];

/** Consecutive messages from one person within this window group under one name. */
export const GROUP_WINDOW_MS = 5 * 60_000;

/** The chat rhythm: rows sit 20pt apart (CrewChat's `gap: 20px`); a grouped row sits 8pt under the one before. */
export const CHAT_GAP = 20;
export const GROUPED_GAP = 8;

/** Your bubble's widest (CrewChat: `max-width: 280px`). */
export const OWN_MAX_WIDTH = 280;

export type ChatReply = { author: string; body: string };

/**
 * Does this message continue the one before it? Same author, neither deleted
 * nor a notice, and within `GROUP_WINDOW_MS`. Screens call it while laying out
 * the list; times are epoch milliseconds.
 */
export function isGrouped(
  prev: { authorId: string; at: number; notice?: boolean | undefined } | undefined,
  cur: { authorId: string; at: number },
): boolean {
  if (!prev || prev.notice) return false;
  if (prev.authorId !== cur.authorId) return false;
  const gap = cur.at - prev.at;
  return gap >= 0 && gap <= GROUP_WINDOW_MS;
}

/** What a deleted message leaves behind. */
export function deletedText(own: boolean): string {
  return own ? 'You deleted this message.' : 'Message deleted.';
}

/** The words under your message while it's on its way or after it failed. */
export function statusText(status: ChatMessageStatus | undefined): string | null {
  if (status === 'sending') return 'Sending…';
  if (status === 'failed') return 'Not sent.';
  return null;
}

/** A quoted reply shortened to one line's worth. */
export function replySnippet(body: string, max = 80): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/**
 * The message read as one item: "Lena, 2:14 PM. Replying to Ade: In, if it's
 * before 11. Thursday's going to be a washout." Yours start "You"; status
 * words come last ("Not sent.").
 */
export function chatMessageLabel(p: {
  author: string;
  body: string;
  own?: boolean | undefined;
  time?: string | undefined;
  deleted?: boolean | undefined;
  replyTo?: ChatReply | undefined;
  status?: ChatMessageStatus | undefined;
}): string {
  const who = [p.own ? 'You' : p.author, p.time].filter(Boolean).join(', ');
  if (p.deleted) return `${who}. ${deletedText(Boolean(p.own))}`;
  const reply = p.replyTo
    ? ` Replying to ${p.replyTo.author}: ${replySnippet(p.replyTo.body)}`
    : '';
  const status = p.own ? statusText(p.status) : null;
  const body = /[.!?…]$/.test(p.body.trim()) ? p.body.trim() : `${p.body.trim()}.`;
  return `${who}.${reply}${reply && !/[.!?…]$/.test(reply) ? '.' : ''} ${body}${status ? ` ${status}` : ''}`;
}

/** The composer can send when there's something to send and a connection. */
export function canSend(
  text: string,
  opts: { offline?: boolean; disabled?: boolean; sending?: boolean },
): boolean {
  return text.trim().length > 0 && !opts.offline && !opts.disabled && !opts.sending;
}

/** The composer's hint: why it can't send, or nothing. */
export function composerHint(opts: {
  offline?: boolean;
  disabledReason?: string | undefined;
}): string | undefined {
  if (opts.disabledReason) return opts.disabledReason;
  if (opts.offline) return "Offline. You can send when you're back.";
  return undefined;
}
