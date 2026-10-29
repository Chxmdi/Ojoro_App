import { describe, expect, it } from 'vitest';

import {
  canSend,
  chatMessageLabel,
  composerHint,
  deletedText,
  GROUP_WINDOW_MS,
  isGrouped,
  replySnippet,
  statusText,
} from './ChatMessage.logic';

describe('ChatMessage logic', () => {
  it('groups consecutive messages from one person within the window', () => {
    const prev = { authorId: 'lena', at: 1000 };
    expect(isGrouped(prev, { authorId: 'lena', at: 1000 + 60_000 })).toBe(true);
    expect(isGrouped(prev, { authorId: 'lena', at: 1000 + GROUP_WINDOW_MS + 1 })).toBe(false);
    expect(isGrouped(prev, { authorId: 'ade', at: 2000 })).toBe(false);
    expect(isGrouped(undefined, { authorId: 'lena', at: 2000 })).toBe(false);
    expect(isGrouped({ ...prev, notice: true }, { authorId: 'lena', at: 2000 })).toBe(false);
    expect(isGrouped(prev, { authorId: 'lena', at: 0 })).toBe(false);
  });

  it('words deleted and status', () => {
    expect(deletedText(true)).toBe('You deleted this message.');
    expect(deletedText(false)).toBe('Message deleted.');
    expect(statusText('sending')).toBe('Sending…');
    expect(statusText('failed')).toBe('Not sent.');
    expect(statusText('sent')).toBeNull();
    expect(statusText(undefined)).toBeNull();
  });

  it('shortens a reply quote', () => {
    expect(replySnippet('  In,\n if  it’s before 11. ')).toBe('In, if it’s before 11.');
    expect(replySnippet('a'.repeat(100), 10)).toBe(`${'a'.repeat(9)}…`);
  });

  it('reads the message as one item', () => {
    expect(
      chatMessageLabel({
        author: 'Lena',
        time: '2:14 PM',
        body: 'Anyone up for Saturday morning instead?',
      }),
    ).toBe('Lena, 2:14 PM. Anyone up for Saturday morning instead?');
    expect(chatMessageLabel({ author: 'Ade', body: 'In' })).toBe('Ade. In.');
    expect(
      chatMessageLabel({
        author: 'Me',
        own: true,
        body: 'Same',
        status: 'failed',
        replyTo: { author: 'Ade', body: 'In, if it’s before 11' },
      }),
    ).toBe('You. Replying to Ade: In, if it’s before 11. Same. Not sent.');
    expect(chatMessageLabel({ author: 'Sam', body: 'x', deleted: true })).toBe(
      'Sam. Message deleted.',
    );
    expect(chatMessageLabel({ author: 'Sam', body: 'x', status: 'failed' })).toBe('Sam. x.');
  });

  it('decides when the composer can send, and says why not', () => {
    expect(canSend('hi', {})).toBe(true);
    expect(canSend('   ', {})).toBe(false);
    expect(canSend('hi', { offline: true })).toBe(false);
    expect(canSend('hi', { disabled: true })).toBe(false);
    expect(canSend('hi', { sending: true })).toBe(false);
    expect(composerHint({})).toBeUndefined();
    expect(composerHint({ offline: true })).toBe("Offline. You can send when you're back.");
    expect(composerHint({ offline: true, disabledReason: 'Only crew members can post.' })).toBe(
      'Only crew members can post.',
    );
  });
});
