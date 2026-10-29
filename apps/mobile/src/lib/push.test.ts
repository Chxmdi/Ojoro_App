import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  os: 'ios' as string,
  rpc: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mocks.os;
    },
  },
}));
vi.mock('./rpc', () => ({ rpc: mocks.rpc }));
// The hooks run as plain functions here: effects run at once, state setters are recorded.
const react = vi.hoisted(() => ({ set: vi.fn(), subscribe: null as null | ((cb: () => void) => () => void) }));
vi.mock('react', () => ({
  useEffect: (fn: () => void) => fn(),
  useState: (init: unknown) => [init, react.set],
  useSyncExternalStore: (subscribe: (cb: () => void) => () => void, get: () => unknown) => {
    react.subscribe = subscribe;
    return get();
  },
}));
vi.mock('./supabase', () => ({ supabase: { auth: { signOut: mocks.signOut } } }));

import {
  askForPush,
  currentPushToken,
  pushSupported,
  registerIfAllowed,
  usePushOffer,
  usePushRegistration,
  setPushAdapter,
  shouldOfferPush,
  signOutWithPush,
  type PushAdapter,
} from './push';

function adapter(over: Partial<PushAdapter> = {}): PushAdapter {
  return {
    permission: vi.fn(async () => 'granted' as const),
    request: vi.fn(async () => 'granted' as const),
    token: vi.fn(async () => 'ExponentPushToken[abc]'),
    ...over,
  };
}

beforeEach(() => {
  mocks.os = 'ios';
  mocks.rpc.mockReset();
  mocks.rpc.mockResolvedValue('id');
  mocks.signOut.mockReset();
  setPushAdapter(null);
});

describe('when to offer', () => {
  it('is native only, with the adapter', () => {
    expect(pushSupported('ios', true)).toBe(true);
    expect(pushSupported('android', true)).toBe(true);
    expect(pushSupported('web', true)).toBe(false);
    expect(pushSupported('ios', false)).toBe(false);
  });

  it('offers only after sign-in, while undecided and not declined', () => {
    const base = { platform: 'ios', hasAdapter: true, signedIn: true, permission: 'undetermined' as const, declined: false };
    expect(shouldOfferPush(base)).toBe(true);
    expect(shouldOfferPush({ ...base, signedIn: false })).toBe(false);
    expect(shouldOfferPush({ ...base, permission: 'granted' })).toBe(false);
    expect(shouldOfferPush({ ...base, permission: null })).toBe(false);
    expect(shouldOfferPush({ ...base, declined: true })).toBe(false);
    expect(shouldOfferPush({ ...base, platform: 'web' })).toBe(false);
  });
});

describe('registration', () => {
  it('does nothing without the adapter or on the web', async () => {
    expect(await registerIfAllowed()).toBeNull();
    setPushAdapter(adapter());
    mocks.os = 'web';
    expect(await registerIfAllowed()).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('never asks; registers only when already allowed', async () => {
    const a = adapter({ permission: vi.fn(async () => 'undetermined' as const) });
    setPushAdapter(a);
    expect(await registerIfAllowed()).toBeNull();
    expect(a.request).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('registers the token with the platform', async () => {
    setPushAdapter(adapter());
    expect(await registerIfAllowed()).toBe('ExponentPushToken[abc]');
    expect(mocks.rpc).toHaveBeenCalledWith('register_push_token', { p_token: 'ExponentPushToken[abc]', p_platform: 'ios' });
    expect(currentPushToken()).toBe('ExponentPushToken[abc]');
  });

  it('skips a device without a token', async () => {
    setPushAdapter(adapter({ token: vi.fn(async () => null) }));
    expect(await registerIfAllowed()).toBeNull();
  });

  it('asks from a tap and registers on yes', async () => {
    expect(await askForPush()).toBe('denied');
    setPushAdapter(adapter());
    expect(await askForPush()).toBe('granted');
    expect(mocks.rpc).toHaveBeenCalledWith('register_push_token', expect.anything());
    setPushAdapter(adapter({ request: vi.fn(async () => 'denied' as const) }));
    mocks.rpc.mockClear();
    expect(await askForPush()).toBe('denied');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe('sign-out', () => {
  it('unregisters the token first, then signs out', async () => {
    setPushAdapter(adapter());
    await registerIfAllowed();
    mocks.rpc.mockClear();
    await signOutWithPush();
    expect(mocks.rpc).toHaveBeenCalledWith('unregister_push_token', { p_token: 'ExponentPushToken[abc]' });
    expect(mocks.signOut).toHaveBeenCalled();
    expect(currentPushToken()).toBeNull();
  });

  it('signs out even when unregistering fails, and without a token', async () => {
    setPushAdapter(adapter());
    await registerIfAllowed();
    mocks.rpc.mockRejectedValueOnce(new Error('offline'));
    await signOutWithPush();
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    await signOutWithPush();
    expect(mocks.signOut).toHaveBeenCalledTimes(2);
  });
});

describe('hooks', () => {
  it('registers on start only when signed in', async () => {
    setPushAdapter(adapter());
    usePushRegistration(null);
    await Promise.resolve();
    expect(mocks.rpc).not.toHaveBeenCalled();
    usePushRegistration('me');
    await vi.waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('register_push_token', expect.anything()));
  });

  it('reads the permission and answers the offer', async () => {
    react.set.mockReset();
    const a = adapter({ permission: vi.fn(async () => 'undetermined' as const) });
    setPushAdapter(a);
    const offer = usePushOffer(true);
    expect(offer.offer).toBe(false); // permission not read yet
    await vi.waitFor(() => expect(react.set).toHaveBeenCalledWith('undetermined'));
    const unsubscribe = react.subscribe?.(() => undefined);
    unsubscribe?.();
    await offer.ask();
    expect(a.request).toHaveBeenCalled();
    offer.notNow();
  });

  it('offers nothing on the web', () => {
    mocks.os = 'web';
    setPushAdapter(adapter());
    expect(usePushOffer(true).offer).toBe(false);
  });
});
