/**
 * Public runtime config for the mobile app.
 *
 * Pure on purpose: callers pass the raw values in, so this runs (and is tested) in plain Node.
 * Expo only inlines `process.env.EXPO_PUBLIC_*` when each variable is read by its full literal name,
 * so the caller (see `supabase.ts`) must build the input object with literal property reads.
 *
 * URLs are parsed with a regex rather than `URL`, because React Native's `URL` is incomplete.
 */

export type PublicEnvInput = {
  EXPO_PUBLIC_SUPABASE_URL?: string | undefined;
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string | undefined;
};

export type SupabaseKeyKind = 'publishable' | 'legacy-anon';

export type SupabaseConfig = {
  /** Origin of the Supabase API, without a trailing slash, e.g. `https://abc.supabase.co`. */
  url: string;
  /** Publishable (or legacy anon) key. Safe to ship in the app; RLS does the protecting. */
  publishableKey: string;
  keyKind: SupabaseKeyKind;
};

export type EnvResult = { ok: true; config: SupabaseConfig } | { ok: false; errors: string[] };

export class EnvError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(
      `Supabase config is invalid. Set these in apps/mobile/.env (see apps/mobile/.env.example):\n- ${errors.join('\n- ')}`,
    );
    this.name = 'EnvError';
    this.errors = errors;
  }
}

const URL_KEY = 'EXPO_PUBLIC_SUPABASE_URL';
const PUBLISHABLE_KEY = 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY';

const URL_PATTERN = /^(https?):\/\/([a-z0-9.-]+|\[[0-9a-f:]+\])(?::(\d{1,5}))?\/?$/i;

/** Hosts where plain http is fine: this machine, the Android emulator's host alias and private LANs. */
function isLocalHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === 'localhost' ||
    h === '[::1]' ||
    h.endsWith('.local') ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(h)
  );
}

function validateUrl(raw: string | undefined, errors: string[]): string | undefined {
  const value = raw?.trim();
  if (!value) {
    errors.push(`${URL_KEY} is missing.`);
    return undefined;
  }
  const match = URL_PATTERN.exec(value);
  if (!match) {
    errors.push(
      `${URL_KEY} must be an http(s) origin with no path, like https://<project-ref>.supabase.co.`,
    );
    return undefined;
  }
  const [, scheme = '', host = '', port] = match;
  if (port !== undefined && Number(port) > 65535) {
    errors.push(`${URL_KEY} has an invalid port.`);
    return undefined;
  }
  if (scheme.toLowerCase() === 'http' && !isLocalHost(host)) {
    errors.push(`${URL_KEY} must use https outside local development.`);
    return undefined;
  }
  return value.replace(/\/$/, '');
}

/** Reads the `role` claim of a JWT-shaped key, or undefined if it can't be decoded. */
function jwtRole(token: string): string | undefined {
  const payload = token.split('.')[1];
  if (!payload || typeof globalThis.atob !== 'function') return undefined;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const claims: unknown = JSON.parse(globalThis.atob(padded));
    if (claims && typeof claims === 'object' && 'role' in claims) {
      const { role } = claims as { role: unknown };
      return typeof role === 'string' ? role : undefined;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function validateKey(
  raw: string | undefined,
  errors: string[],
): { key: string; kind: SupabaseKeyKind } | undefined {
  const value = raw?.trim();
  if (!value) {
    errors.push(`${PUBLISHABLE_KEY} is missing.`);
    return undefined;
  }
  if (value.startsWith('sb_secret_')) {
    errors.push(
      `${PUBLISHABLE_KEY} is a secret key. Secret keys bypass row-level security and must never ship in the app; use the sb_publishable_ key.`,
    );
    return undefined;
  }
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) {
    return { key: value, kind: 'publishable' };
  }
  if (/^eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) {
    const role = jwtRole(value);
    if (role === 'service_role') {
      errors.push(
        `${PUBLISHABLE_KEY} is a service_role key. It bypasses row-level security and must never ship in the app; use the publishable key.`,
      );
      return undefined;
    }
    if (role !== 'anon') {
      errors.push(`${PUBLISHABLE_KEY} is a JWT without the anon role; use the publishable key.`);
      return undefined;
    }
    return { key: value, kind: 'legacy-anon' };
  }
  errors.push(
    `${PUBLISHABLE_KEY} is not a Supabase publishable key (expected sb_publishable_...).`,
  );
  return undefined;
}

/** Validates the public Supabase env vars. Never throws; returns every problem found. */
export function parseSupabaseEnv(input: PublicEnvInput): EnvResult {
  const errors: string[] = [];
  const url = validateUrl(input.EXPO_PUBLIC_SUPABASE_URL, errors);
  const key = validateKey(input.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, errors);
  if (url === undefined || key === undefined) return { ok: false, errors };
  return { ok: true, config: { url, publishableKey: key.key, keyKind: key.kind } };
}

/** Like `parseSupabaseEnv`, but throws an `EnvError` listing every problem. */
export function getSupabaseConfig(input: PublicEnvInput): SupabaseConfig {
  const result = parseSupabaseEnv(input);
  if (!result.ok) throw new EnvError(result.errors);
  return result.config;
}
