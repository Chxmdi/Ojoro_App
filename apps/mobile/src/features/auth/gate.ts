/**
 * The auth gate's rules, pure so they're tested in Node. The root layout applies them to every
 * screen by route name, so routes added later are protected without being registered.
 */

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in';

/** What the signed-in person's profile says about onboarding. */
export type ProfileGateInfo = {
  onboardingCompleted: boolean;
  hasName: boolean;
};

export type Gate =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  /** Signed in but the profile couldn't be read and nothing is cached (first launch offline). */
  | { kind: 'profile-error' }
  | { kind: 'onboarding'; needsName: boolean }
  | { kind: 'ready' };

export function gateFor(
  auth: AuthStatus,
  profile: { status: 'pending' | 'error' | 'success'; data: ProfileGateInfo | null | undefined },
): Gate {
  if (auth === 'loading') return { kind: 'loading' };
  if (auth === 'signed-out') return { kind: 'signed-out' };
  if (profile.data) {
    return profile.data.onboardingCompleted
      ? { kind: 'ready' }
      : { kind: 'onboarding', needsName: !profile.data.hasName };
  }
  if (profile.status === 'error') return { kind: 'profile-error' };
  if (profile.status === 'success') {
    // Signed in but no profile row is visible: the trigger creates it at sign-up, so treat it as
    // a brand-new account.
    return { kind: 'onboarding', needsName: true };
  }
  return { kind: 'loading' };
}

/** Who may see a route. */
export type RouteAccess = 'public' | 'auth' | 'onboarding' | 'app';

/** Route names as the root Stack sees them: "(tabs)", "(auth)", "plan/[id]", "storybook"… */
export function routeAccess(routeName: string): RouteAccess {
  const first = routeName.split('/')[0] ?? routeName;
  if (first === '(auth)') return 'auth';
  if (first === '(onboarding)') return 'onboarding';
  if (first === 'storybook' || first === '+not-found' || first === '_sitemap') return 'public';
  return 'app';
}

export const WELCOME = '/welcome';
export const ONBOARDING_NAME = '/name';
export const ONBOARDING_FIRST = '/sports';
export const HOME = '/';

/**
 * Where a screen of this kind should send the person instead, or null when it may show.
 * `returnTo` is the deep link saved while signed out.
 */
export function redirectFor(gate: Gate, access: RouteAccess, returnTo: string | null): string | null {
  if (access === 'public') return null;
  switch (gate.kind) {
    case 'loading':
    case 'profile-error':
      return null;
    case 'signed-out':
      return access === 'auth' ? null : WELCOME;
    case 'onboarding':
      if (access === 'onboarding') return null;
      return gate.needsName ? ONBOARDING_NAME : ONBOARDING_FIRST;
    case 'ready':
      return access === 'app' ? null : (returnTo ?? HOME);
  }
}

/** Whether a screen's content may render under this gate (no flash of the wrong screen). */
export function mayRender(gate: Gate, access: RouteAccess): boolean {
  if (access === 'public') return true;
  switch (gate.kind) {
    case 'loading':
    case 'profile-error':
      return false;
    case 'signed-out':
      return access === 'auth';
    case 'onboarding':
      return access === 'onboarding';
    case 'ready':
      return access === 'app';
  }
}

/**
 * Deep links worth returning to after sign-in: a plan, a game, a profile… Not the tabs' home,
 * which is where everyone lands anyway, and nothing in auth or onboarding.
 */
export function returnablePath(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const path = pathname.split('?')[0]?.split('#')[0] ?? '';
  if (path === '' || path === '/' || !path.startsWith('/')) return null;
  const blocked = ['/welcome', '/phone', '/code', '/name', '/sports', '/when', '/area', '/privacy', '/storybook'];
  if (blocked.some((b) => path === b || path.startsWith(`${b}/`))) return null;
  if (path.includes('..')) return null;
  return pathname;
}
