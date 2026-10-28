import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// supabase.ts is native glue; these tests pin the client options and the AppState wiring.
const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  addEventListener: vi.fn(),
  startAutoRefresh: vi.fn(),
  stopAutoRefresh: vi.fn(),
  platform: { OS: 'ios' as string },
}));

vi.mock('@react-native-async-storage/async-storage', () => ({ default: { name: 'AsyncStorage' } }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
  processLock: 'processLock',
}));
vi.mock('react-native', () => ({
  AppState: { addEventListener: mocks.addEventListener },
  Platform: mocks.platform,
}));

async function load() {
  vi.resetModules();
  return import('./supabase');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.platform.OS = 'ios';
  mocks.createClient.mockReturnValue({
    auth: { startAutoRefresh: mocks.startAutoRefresh, stopAutoRefresh: mocks.stopAutoRefresh },
  });
  vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('supabase client', () => {
  it('creates the client with AsyncStorage sessions and native-app auth options', async () => {
    await load();
    expect(mocks.createClient).toHaveBeenCalledWith(
      'http://127.0.0.1:54321',
      'sb_publishable_test',
      {
        auth: {
          storage: { name: 'AsyncStorage' },
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
          lock: 'processLock',
        },
      },
    );
  });

  it('keeps the session in memory during static web rendering', async () => {
    mocks.platform.OS = 'web';
    await load();
    const storage = mocks.createClient.mock.calls[0]?.[2].auth.storage;
    expect(storage).not.toEqual({ name: 'AsyncStorage' });
    expect(await storage.getItem('k')).toBeNull();
    await storage.setItem('k', 'v');
    expect(await storage.getItem('k')).toBe('v');
    await storage.removeItem('k');
    expect(await storage.getItem('k')).toBeNull();
  });

  it('refreshes tokens only while the app is active', async () => {
    await load();
    expect(mocks.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    const onChange = mocks.addEventListener.mock.calls[0]?.[1] as (state: string) => void;

    onChange('active');
    expect(mocks.startAutoRefresh).toHaveBeenCalledTimes(1);

    onChange('background');
    onChange('inactive');
    expect(mocks.stopAutoRefresh).toHaveBeenCalledTimes(2);
  });

  it('leaves refresh to the client on web', async () => {
    mocks.platform.OS = 'web';
    await load();
    expect(mocks.addEventListener).not.toHaveBeenCalled();
  });

  it('fails fast with a clear error when the env is not set', async () => {
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    await expect(load()).rejects.toThrow(/EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing/);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
