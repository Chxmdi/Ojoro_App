/**
 * Push-token registration (docs/MESSAGING_CONTRACT.md: `register_push_token`,
 * `unregister_push_token`). Nothing here sends a push; delivery is an owner decision.
 *
 * `expo-notifications` is not installed (no new dependencies without the owner's OK), so the
 * device side is an adapter. Once it is installed, plug it in once at startup:
 *
 *   import * as Notifications from 'expo-notifications';
 *   import Constants from 'expo-constants';
 *   setPushAdapter({
 *     permission: async () => (await Notifications.getPermissionsAsync()).status,
 *     request: async () => (await Notifications.requestPermissionsAsync()).status,
 *     token: async () =>
 *       (await Notifications.getExpoPushTokenAsync({ projectId: Constants.expoConfig?.extra?.eas?.projectId })).data,
 *   });
 *
 * Until then every function here is a no-op that says so (`available: false`).
 *
 * When to ask: never on first launch and never at sign-in. Only after sign-in, in context: Updates
 * offers it ("Get told when a plan needs you.") once, and a NOT NOW is remembered on the device.
 * If permission was already granted, the token is registered on every app start (refreshes
 * `last_seen_at`). Web: skipped (Expo push tokens are for iOS and Android).
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { rpc } from './rpc';
import { supabase } from './supabase';

export type PushPermission = 'granted' | 'denied' | 'undetermined';

export type PushAdapter = {
  permission: () => Promise<PushPermission>;
  request: () => Promise<PushPermission>;
  /** The Expo push token ("ExponentPushToken[…]"), or null when the device can't have one. */
  token: () => Promise<string | null>;
};

let adapter: PushAdapter | null = null;
let registeredToken: string | null = null;
let declined = false;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

/** Plug in the device side (expo-notifications). Pass null to detach (tests). */
export function setPushAdapter(next: PushAdapter | null): void {
  adapter = next;
  emit();
}

/** The token registered for this session, if any (tests and sign-out). */
export function currentPushToken(): string | null {
  return registeredToken;
}

type Platformish = 'ios' | 'android' | 'web' | 'windows' | 'macos' | string;

/** Whether this device can register at all: native with the adapter plugged in. */
export function pushSupported(platform: Platformish, hasAdapter: boolean): boolean {
  return hasAdapter && (platform === 'ios' || platform === 'android');
}

/** Whether Updates should offer to turn pushes on: signed in, supported, not decided, not declined. */
export function shouldOfferPush(input: {
  platform: Platformish;
  hasAdapter: boolean;
  signedIn: boolean;
  permission: PushPermission | null;
  declined: boolean;
}): boolean {
  return (
    input.signedIn &&
    pushSupported(input.platform, input.hasAdapter) &&
    input.permission === 'undetermined' &&
    !input.declined
  );
}

/** Gets the token and registers it. Never asks for permission. Returns the token or null. */
export async function registerIfAllowed(): Promise<string | null> {
  if (!adapter || !pushSupported(Platform.OS, true)) return null;
  if ((await adapter.permission()) !== 'granted') return null;
  const token = await adapter.token();
  if (!token) return null;
  await rpc('register_push_token', { p_token: token, p_platform: Platform.OS as 'ios' | 'android' });
  registeredToken = token;
  return token;
}

/** Asks the OS (only from a tap), then registers on yes. */
export async function askForPush(): Promise<PushPermission> {
  if (!adapter || !pushSupported(Platform.OS, true)) return 'denied';
  const answer = await adapter.request();
  if (answer === 'granted') await registerIfAllowed();
  else declined = true;
  emit();
  return answer;
}

/** NOT NOW: don't offer again on this device during this install. */
export function declinePush(): void {
  declined = true;
  emit();
}

/**
 * Sign out, unregistering this device's token first (the RPC needs the session). A failed
 * unregister never blocks signing out: the server moves the token on the next sign-in anyway.
 */
export async function signOutWithPush(): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  if (token) {
    try {
      await rpc('unregister_push_token', { p_token: token });
    } catch {
      // Offline or already gone: the token moves to whoever signs in next on this device.
    }
  }
  await supabase.auth.signOut();
}

/** On every start while signed in: register the token if permission is already granted. */
export function usePushRegistration(userId: string | null): void {
  useEffect(() => {
    if (!userId) return;
    void registerIfAllowed().catch(() => undefined);
  }, [userId]);
}

/** Updates' offer: whether to show it, and the two answers. */
export function usePushOffer(signedIn: boolean) {
  const version = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => `${adapter ? 1 : 0}${declined ? 1 : 0}`,
    () => '00',
  );
  const [permission, setPermission] = useState<PushPermission | null>(null);
  useEffect(() => {
    if (!adapter || !pushSupported(Platform.OS, true)) return;
    void adapter.permission().then(setPermission, () => setPermission(null));
  }, [version]);
  return {
    offer: shouldOfferPush({ platform: Platform.OS, hasAdapter: adapter !== null, signedIn, permission, declined }),
    ask: async () => setPermission(await askForPush()),
    notNow: declinePush,
  };
}
