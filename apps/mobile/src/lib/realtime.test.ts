import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const subscribers: ((status: string) => void)[] = [];
  const handlers: (() => void)[] = [];
  const channel = {
    on: vi.fn((_kind: unknown, _filter: unknown, handler: () => void) => {
      handlers.push(handler);
      return channel;
    }),
    subscribe: vi.fn((cb: (status: string) => void) => {
      subscribers.push(cb);
      return channel;
    }),
  };
  return {
    channel,
    subscribers,
    handlers,
    supabase: { channel: vi.fn(() => channel), removeChannel: vi.fn() },
  };
});

vi.mock('./supabase', () => ({ supabase: mocks.supabase }));
vi.mock('react-native', () => ({
  AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
}));

import { channels, watchTopic } from './realtime';

const sub = {
  channel: 'activity:a1',
  changes: [
    {
      event: 'UPDATE' as const,
      schema: 'public' as const,
      table: 'activities',
      filter: 'id=eq.a1',
    },
    {
      event: '*' as const,
      schema: 'public' as const,
      table: 'attendance',
      filter: 'activity_id=eq.a1',
    },
  ],
};

beforeEach(() => {
  channels.clear();
  mocks.subscribers.length = 0;
  mocks.handlers.length = 0;
  vi.clearAllMocks();
});

describe('watchTopic', () => {
  it('shares one channel between screens watching the same topic', () => {
    const a = vi.fn();
    const b = vi.fn();
    const stopA = watchTopic(sub, a);
    const stopB = watchTopic(sub, b);
    expect(mocks.supabase.channel).toHaveBeenCalledTimes(1);
    expect(mocks.channel.on).toHaveBeenCalledTimes(2);

    mocks.handlers[0]?.();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    stopA();
    expect(mocks.supabase.removeChannel).not.toHaveBeenCalled();
    stopB();
    expect(mocks.supabase.removeChannel).toHaveBeenCalledTimes(1);
    expect(channels.size).toBe(0);
  });

  it('opens a fresh channel name after the last screen left, never a closing one', () => {
    watchTopic(sub, vi.fn())();
    watchTopic(sub, vi.fn());
    const names = mocks.supabase.channel.mock.calls.map((call) => String((call as unknown[])[0]));
    expect(names).toHaveLength(2);
    expect(names[0]).not.toBe(names[1]);
    expect(names.every((name) => name.startsWith('activity:a1#'))).toBe(true);
  });

  it('refetches everyone on subscribe, and catches up a screen that joins later', () => {
    const a = vi.fn();
    watchTopic(sub, a);
    mocks.subscribers[0]?.('CHANNEL_ERROR');
    expect(a).not.toHaveBeenCalled();
    mocks.subscribers[0]?.('SUBSCRIBED');
    expect(a).toHaveBeenCalledTimes(1);

    const late = vi.fn();
    watchTopic(sub, late);
    expect(late).toHaveBeenCalledTimes(1);
  });
});
