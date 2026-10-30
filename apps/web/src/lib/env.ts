/**
 * Public runtime config for the staff admin tool. Pure: the caller passes the raw values in, so this
 * runs and is tested in Node.
 *
 * The admin tool only ever holds the publishable key and the signed-in staff user's session. Every
 * staff power is checked server-side by the staff RPCs (docs/TRUST_CONTRACT.md). A secret or
 * service-role key in the browser would bypass all of that, so this refuses to start with one.
 */

export type AdminEnvInput = {
  VITE_SUPABASE_URL?: string | undefined;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string | undefined;
};

export type AdminConfig = { url: string; publishableKey: string };

export type AdminEnvResult = { ok: true; config: AdminConfig } | { ok: false; errors: string[] };

const URL_PATTERN = /^(https?):\/\/([a-z0-9.-]+|\[[0-9a-f:]+\])(?::(\d{1,5}))?\/?$/i;

function isLocalHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === 'localhost' || h === '[::1]' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h);
}

/** The `role` claim of a JWT-shaped key, or undefined. */
export function jwtRole(token: string): string | undefined {
  const payload = token.split('.')[1];
  if (!payload) return undefined;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const claims: unknown = JSON.parse(globalThis.atob(padded));
    if (claims && typeof claims === 'object' && 'role' in claims) {
      const role = (claims as { role: unknown }).role;
      return typeof role === 'string' ? role : undefined;
    }
  } catch {
    // Not a JWT.
  }
  return undefined;
}

export function getAdminConfig(input: AdminEnvInput): AdminEnvResult {
  const errors: string[] = [];
  const rawUrl = input.VITE_SUPABASE_URL?.trim() ?? '';
  const key = input.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';
  let url = '';

  if (!rawUrl) errors.push('VITE_SUPABASE_URL is missing.');
  else {
    const match = URL_PATTERN.exec(rawUrl);
    if (!match) errors.push('VITE_SUPABASE_URL must be an http(s) origin with no path.');
    else if (match[1]?.toLowerCase() === 'http' && !isLocalHost(match[2] ?? '')) {
      errors.push('VITE_SUPABASE_URL must use https outside local development.');
    } else url = rawUrl.replace(/\/$/, '');
  }

  if (!key) errors.push('VITE_SUPABASE_PUBLISHABLE_KEY is missing.');
  else if (/^sb_secret_/.test(key) || /service_role/i.test(key)) {
    errors.push('VITE_SUPABASE_PUBLISHABLE_KEY is a secret key. Use the publishable key; never ship the secret.');
  } else if (key.startsWith('eyJ')) {
    const role = jwtRole(key);
    if (role !== 'anon') {
      errors.push('VITE_SUPABASE_PUBLISHABLE_KEY must be the publishable (or anon) key, not a service key.');
    }
  } else if (!/^sb_publishable_/.test(key)) {
    errors.push('VITE_SUPABASE_PUBLISHABLE_KEY does not look like a Supabase publishable key.');
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, config: { url, publishableKey: key } };
}
