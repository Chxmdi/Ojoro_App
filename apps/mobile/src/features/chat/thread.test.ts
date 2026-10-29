import { describe, expect, it } from 'vitest';

import {
  buildThread,
  firstName,
  hiddenText,
  mergePages,
  noticeText,
  offlineLine,
  outboxReducer,
  payloadEvent,
  pendingOutbox,
  replyQuote,
  systemText,
  unsent,
  validateMessage,
  type OutboxItem,
  type ThreadMessage,
} from './thread';

const TZ = 'America/Toronto';
const NOW = new Date('2026-10-29T18:30:00Z'); // 2:30 PM in Montréal

function msg(over: Partial<ThreadMessage> & { id: string; created_at: string }): ThreadMessage {
  return {
    sender_id: 'lena',
    sender_name: 'Lena R',
    kind: 'text',
    body: 'Hi',
    reply_to: null,
    payload: null,
    edited_at: null,
    is_deleted: false,
    is_hidden: false,
    is_mine: false,
    mentions_me: false,
    ...over,
  };
}

describe('names and notices', () => {
  it('uses first names', () => {
    expect(firstName('Lena R')).toBe('Lena');
    expect(firstName('  ')).toBe('Someone');
    expect(firstName(null)).toBe('Someone');
  });

  it('labels the day and time', () => {
    expect(noticeText('2026-10-29T18:14:00Z', NOW, TZ)).toBe('TODAY · 2:14 PM');
    expect(noticeText('2026-10-28T22:02:00Z', NOW, TZ)).toBe('YESTERDAY · 6:02 PM');
    expect(noticeText('2026-10-26T23:30:00Z', NOW, TZ)).toBe('MON · 7:30 PM');
    expect(noticeText('2026-10-10T23:30:00Z', NOW, TZ)).toBe('SAT 10 OCT · 7:30 PM');
  });

  it('counts hidden messages', () => {
    expect(hiddenText(1)).toBe('1 message hidden');
    expect(hiddenText(3)).toBe('3 messages hidden');
  });

  it('writes system lines from facts', () => {
    const m = msg({
      id: 's',
      created_at: '2026-10-29T18:20:00Z',
      kind: 'system',
      body: 'Lena R tapped MAKE THIS A GAME',
      payload: { event: 'make_this_a_game', plan_id: 'p', suggestion_id: 'x' },
    });
    expect(systemText(m, TZ)).toBe('2:20 PM · Lena tapped MAKE THIS A GAME');
    expect(systemText({ ...m, sender_name: null }, TZ)).toBe('2:20 PM · Someone tapped MAKE THIS A GAME');
    expect(systemText({ ...m, payload: null, body: 'Something happened' }, TZ)).toBe('2:20 PM · Something happened');
    expect(systemText({ ...m, payload: null, body: null }, TZ)).toBe('2:20 PM ·');
  });

  it('reads payloads defensively', () => {
    expect(payloadEvent(null)).toBeNull();
    expect(payloadEvent('x')).toBeNull();
    expect(payloadEvent({ plan_id: 'p' })).toBeNull();
    expect(payloadEvent({ event: 'e', plan_id: 3 })).toEqual({ event: 'e', plan_id: undefined, suggestion_id: undefined });
  });
});

describe('mergePages', () => {
  it('reads oldest first with each message once', () => {
    const a = msg({ id: 'a', created_at: '2026-10-29T18:00:00Z' });
    const b = msg({ id: 'b', created_at: '2026-10-29T18:01:00Z' });
    const c = msg({ id: 'c', created_at: '2026-10-29T18:01:00Z' });
    expect(mergePages([[c, b], [b, a]]).map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('replyQuote', () => {
  const lena = msg({ id: 'l', created_at: '2026-10-29T18:00:00Z', body: 'In?' });
  const map = new Map([
    ['l', lena],
    ['d', { ...lena, id: 'd', is_deleted: true, body: null }],
    ['h', { ...lena, id: 'h', is_hidden: true }],
    ['m', { ...lena, id: 'm', is_mine: true }],
  ]);
  it('quotes what is loaded', () => {
    expect(replyQuote(null, map)).toBeUndefined();
    expect(replyQuote('l', map)).toEqual({ author: 'Lena', body: 'In?' });
    expect(replyQuote('m', map)).toEqual({ author: 'You', body: 'In?' });
    expect(replyQuote('d', map)?.body).toBe('Message deleted.');
    expect(replyQuote('h', map)?.author).toBe('Hidden');
    expect(replyQuote('zzz', map)?.author).toBe('Earlier message');
  });
});

describe('buildThread', () => {
  it('adds notices, groups, collapses hidden runs and shows system lines', () => {
    const rows = [
      msg({ id: '1', created_at: '2026-10-29T18:14:00Z' }),
      msg({ id: '2', created_at: '2026-10-29T18:15:00Z' }),
      msg({ id: '3', created_at: '2026-10-29T18:16:00Z', sender_id: 'ade', sender_name: 'Ade B', reply_to: '1' }),
      msg({ id: '4', created_at: '2026-10-29T18:17:00Z', is_hidden: true, sender_id: null, sender_name: null, body: null }),
      msg({ id: '5', created_at: '2026-10-29T18:17:30Z', is_hidden: true, sender_id: null, sender_name: null, body: null }),
      msg({ id: '6', created_at: '2026-10-29T18:18:00Z', is_mine: true, sender_id: 'me', sender_name: 'Chimdi O' }),
      msg({ id: '7', created_at: '2026-10-29T18:20:00Z', kind: 'system', payload: { event: 'make_this_a_game' } }),
      msg({ id: '8', created_at: '2026-10-29T19:30:00Z', is_deleted: true, body: null }),
      msg({ id: '9', created_at: '2026-10-29T19:31:00Z' }),
    ];
    const items = buildThread(rows, [], NOW, TZ, 'me');
    expect(items.map((i) => i.type)).toEqual([
      'notice',
      'message',
      'message',
      'message',
      'hidden',
      'message',
      'system',
      'notice',
      'message',
      'message',
    ]);
    const msgs = items.filter((i) => i.type === 'message');
    expect(msgs.map((m) => m.grouped)).toEqual([false, true, false, false, false, false]);
    expect(msgs[0]?.author).toBe('Lena');
    expect(msgs[3]?.author).toBe('You');
    expect(msgs[2]?.replyTo).toEqual({ author: 'Lena', body: 'Hi' });
    expect(items[4]).toMatchObject({ type: 'hidden', count: 2, text: '2 messages hidden' });
  });

  it('puts the outbox after the thread and drops what came back', () => {
    const rows = [msg({ id: '1', created_at: '2026-10-29T18:14:00Z', is_mine: true, sender_id: 'me' })];
    const outbox: OutboxItem[] = [
      { key: 'k1', body: 'Back', replyTo: null, status: 'sending', id: '1', at: '2026-10-29T18:14:00Z' },
      { key: 'k2', body: 'On its way', replyTo: '1', status: 'sending', id: null, at: '2026-10-29T18:15:00Z' },
    ];
    const items = buildThread(rows, outbox, NOW, TZ, 'me');
    expect(items.map((i) => i.type)).toEqual(['notice', 'message', 'outbox']);
    expect(items[2]).toMatchObject({ grouped: true, replyTo: { author: 'You', body: 'Hi' } });
    expect(pendingOutbox(outbox, new Map([['1', 1]]))).toHaveLength(1);
  });

  it('starts an empty thread with the outbox and its own notice', () => {
    const items = buildThread(
      [],
      [{ key: 'k', body: 'First', replyTo: null, status: 'failed', id: null, at: '2026-10-29T18:15:00Z' }],
      NOW,
      TZ,
      null,
    );
    expect(items.map((i) => i.type)).toEqual(['notice', 'outbox']);
  });
});

describe('outbox', () => {
  const at = '2026-10-29T18:15:00Z';
  it('queues once per key, then sent, failed, retried and pruned', () => {
    let s = outboxReducer([], { type: 'queue', key: 'k', body: 'Hi', replyTo: null, at });
    s = outboxReducer(s, { type: 'queue', key: 'k', body: 'Hi', replyTo: null, at });
    expect(s).toHaveLength(1);
    expect(unsent(s)).toHaveLength(1);
    s = outboxReducer(s, { type: 'failed', key: 'k', error: 'Not sent.' });
    expect(s[0]).toMatchObject({ status: 'failed', error: 'Not sent.' });
    expect(unsent(s)).toHaveLength(0);
    s = outboxReducer(s, { type: 'retry', key: 'k' });
    expect(s[0]).toMatchObject({ status: 'sending', error: undefined });
    s = outboxReducer(s, { type: 'sent', key: 'k', id: 'm1' });
    expect(unsent(s)).toHaveLength(0);
    expect(outboxReducer(s, { type: 'prune', ids: new Set(['other']) })).toHaveLength(1);
    expect(outboxReducer(s, { type: 'prune', ids: new Set(['m1']) })).toHaveLength(0);
  });

  it('leaves other items alone', () => {
    const s = outboxReducer(
      outboxReducer([], { type: 'queue', key: 'a', body: 'A', replyTo: null, at }),
      { type: 'queue', key: 'b', body: 'B', replyTo: null, at },
    );
    expect(outboxReducer(s, { type: 'failed', key: 'a', error: 'x' })[1]?.status).toBe('sending');
    expect(outboxReducer(s, { type: 'retry', key: 'a' })[1]).toBe(s[1]);
    expect(outboxReducer(s, { type: 'sent', key: 'a', id: '1' })[1]?.id).toBeNull();
  });
});

describe('offline and validation words', () => {
  it('says how old the thread is and what waits', () => {
    expect(offlineLine('7:02 PM', 0)).toBe("Offline. Showing the chat as of 7:02 PM. Messages you send wait and go when you're back.");
    expect(offlineLine(null, 1)).toBe("Offline. 1 message is waiting. They send when you're back.");
    expect(offlineLine('7:02 PM', 2)).toContain('2 messages are waiting');
  });

  it('checks length', () => {
    expect(validateMessage('  hi ', 1000)).toEqual({ ok: true, body: 'hi' });
    expect(validateMessage('   ', 1000)).toEqual({ ok: false, error: 'Write something first.' });
    expect(validateMessage('x'.repeat(1001), 1000)).toEqual({ ok: false, error: 'Messages are 1 to 1,000 characters.' });
  });
});
