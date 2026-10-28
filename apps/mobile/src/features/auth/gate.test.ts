import { describe, expect, it } from 'vitest';

import { gateFor, mayRender, redirectFor, returnablePath, routeAccess, type Gate } from './gate';
import { consumeReturnTo, peekReturnTo, rememberReturnTo } from './returnTo';

const done = { onboardingCompleted: true, hasName: true };
const fresh = { onboardingCompleted: false, hasName: false };

describe('gateFor', () => {
  it('waits for auth', () => {
    expect(gateFor('loading', { status: 'pending', data: undefined })).toEqual({ kind: 'loading' });
  });

  it('is signed out without a session', () => {
    expect(gateFor('signed-out', { status: 'pending', data: undefined }).kind).toBe('signed-out');
  });

  it('waits for the profile while signed in', () => {
    expect(gateFor('signed-in', { status: 'pending', data: undefined }).kind).toBe('loading');
  });

  it('routes to onboarding until it is completed', () => {
    expect(gateFor('signed-in', { status: 'success', data: fresh })).toEqual({
      kind: 'onboarding',
      needsName: true,
    });
    expect(
      gateFor('signed-in', {
        status: 'success',
        data: { onboardingCompleted: false, hasName: true },
      }),
    ).toEqual({ kind: 'onboarding', needsName: false });
  });

  it('is ready once onboarding is completed, even from the cache while a refetch fails', () => {
    expect(gateFor('signed-in', { status: 'success', data: done }).kind).toBe('ready');
    expect(gateFor('signed-in', { status: 'error', data: done }).kind).toBe('ready');
  });

  it('reports a profile error when nothing is cached', () => {
    expect(gateFor('signed-in', { status: 'error', data: undefined }).kind).toBe('profile-error');
  });

  it('treats a missing profile row as a new account', () => {
    expect(gateFor('signed-in', { status: 'success', data: null })).toEqual({
      kind: 'onboarding',
      needsName: true,
    });
  });
});

describe('routeAccess', () => {
  it('classifies groups and routes', () => {
    expect(routeAccess('(auth)')).toBe('auth');
    expect(routeAccess('(auth)/welcome')).toBe('auth');
    expect(routeAccess('(onboarding)')).toBe('onboarding');
    expect(routeAccess('storybook')).toBe('public');
    expect(routeAccess('+not-found')).toBe('public');
    expect(routeAccess('_sitemap')).toBe('public');
    expect(routeAccess('(tabs)')).toBe('app');
    expect(routeAccess('plan/[id]')).toBe('app');
    expect(routeAccess('profile/[id]')).toBe('app');
  });
});

const gates: Record<string, Gate> = {
  loading: { kind: 'loading' },
  error: { kind: 'profile-error' },
  out: { kind: 'signed-out' },
  onboardingName: { kind: 'onboarding', needsName: true },
  onboarding: { kind: 'onboarding', needsName: false },
  ready: { kind: 'ready' },
};

describe('redirectFor', () => {
  it('never moves public routes', () => {
    for (const gate of Object.values(gates)) expect(redirectFor(gate, 'public', null)).toBeNull();
  });

  it('holds still while loading or failed', () => {
    expect(redirectFor(gates.loading!, 'app', null)).toBeNull();
    expect(redirectFor(gates.error!, 'auth', null)).toBeNull();
  });

  it('sends signed-out people to Welcome', () => {
    expect(redirectFor(gates.out!, 'app', null)).toBe('/welcome');
    expect(redirectFor(gates.out!, 'onboarding', null)).toBe('/welcome');
    expect(redirectFor(gates.out!, 'auth', null)).toBeNull();
  });

  it('sends unfinished accounts to onboarding, the name first when missing', () => {
    expect(redirectFor(gates.onboardingName!, 'app', null)).toBe('/name');
    expect(redirectFor(gates.onboarding!, 'auth', null)).toBe('/sports');
    expect(redirectFor(gates.onboarding!, 'onboarding', null)).toBeNull();
  });

  it('sends finished accounts home, or back to the deep link', () => {
    expect(redirectFor(gates.ready!, 'auth', null)).toBe('/');
    expect(redirectFor(gates.ready!, 'onboarding', '/plan/1')).toBe('/plan/1');
    expect(redirectFor(gates.ready!, 'app', '/plan/1')).toBeNull();
  });
});

describe('mayRender', () => {
  it('renders only what the gate allows', () => {
    expect(mayRender(gates.loading!, 'app')).toBe(false);
    expect(mayRender(gates.error!, 'app')).toBe(false);
    expect(mayRender(gates.out!, 'auth')).toBe(true);
    expect(mayRender(gates.out!, 'app')).toBe(false);
    expect(mayRender(gates.onboarding!, 'onboarding')).toBe(true);
    expect(mayRender(gates.onboarding!, 'app')).toBe(false);
    expect(mayRender(gates.ready!, 'app')).toBe(true);
    expect(mayRender(gates.ready!, 'auth')).toBe(false);
    expect(mayRender(gates.ready!, 'public')).toBe(true);
  });
});

describe('returnablePath', () => {
  it('keeps deep links into the app', () => {
    expect(returnablePath('/plan/abc')).toBe('/plan/abc');
    expect(returnablePath('/activity/abc?x=1')).toBe('/activity/abc?x=1');
    expect(returnablePath('/settings/privacy')).toBe('/settings/privacy');
  });

  it('drops home, auth, onboarding and odd paths', () => {
    expect(returnablePath('/')).toBeNull();
    expect(returnablePath('')).toBeNull();
    expect(returnablePath(null)).toBeNull();
    expect(returnablePath('/welcome')).toBeNull();
    expect(returnablePath('/code')).toBeNull();
    expect(returnablePath('/sports')).toBeNull();
    expect(returnablePath('plan/abc')).toBeNull();
    expect(returnablePath('/plan/../x')).toBeNull();
  });
});

describe('returnTo', () => {
  it('remembers the latest deep link once', () => {
    rememberReturnTo('/welcome');
    expect(peekReturnTo()).toBeNull();
    rememberReturnTo('/plan/1');
    rememberReturnTo('/activity/2');
    expect(peekReturnTo()).toBe('/activity/2');
    expect(consumeReturnTo()).toBe('/activity/2');
    expect(consumeReturnTo()).toBeNull();
  });
});
