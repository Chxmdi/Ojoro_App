import { describe, expect, it } from 'vitest';

import { EnvError, getSupabaseConfig, parseSupabaseEnv } from './env';

const PUBLISHABLE = 'sb_publishable_abc123_DEF-456';

function jwt(payload: Record<string, unknown>): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.c2lnbmF0dXJl`;
}

function errorsOf(input: Parameters<typeof parseSupabaseEnv>[0]): string[] {
  const result = parseSupabaseEnv(input);
  if (result.ok) throw new Error('expected an invalid config');
  return result.errors;
}

describe('parseSupabaseEnv', () => {
  it('accepts a hosted https URL and a publishable key', () => {
    expect(
      parseSupabaseEnv({
        EXPO_PUBLIC_SUPABASE_URL: 'https://abcdefgh.supabase.co',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
      }),
    ).toEqual({
      ok: true,
      config: {
        url: 'https://abcdefgh.supabase.co',
        publishableKey: PUBLISHABLE,
        keyKind: 'publishable',
      },
    });
  });

  it('trims whitespace and a trailing slash', () => {
    const result = parseSupabaseEnv({
      EXPO_PUBLIC_SUPABASE_URL: '  https://abcdefgh.supabase.co/ ',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ` ${PUBLISHABLE}\n`,
    });
    expect(result).toMatchObject({
      ok: true,
      config: { url: 'https://abcdefgh.supabase.co', publishableKey: PUBLISHABLE },
    });
  });

  it.each([
    'http://127.0.0.1:54321',
    'http://localhost:54321',
    'http://10.0.2.2:54321',
    'http://192.168.1.20:54321',
    'http://172.20.0.5:54321',
    'http://my-mac.local:54321',
    'http://[::1]:54321',
  ])('allows plain http for the local host %s', (url) => {
    expect(
      parseSupabaseEnv({
        EXPO_PUBLIC_SUPABASE_URL: url,
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
      }).ok,
    ).toBe(true);
  });

  it('accepts a legacy anon JWT and reports its kind', () => {
    const key = jwt({ role: 'anon', iss: 'supabase' });
    expect(
      parseSupabaseEnv({
        EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
      }),
    ).toMatchObject({ ok: true, config: { keyKind: 'legacy-anon', publishableKey: key } });
  });

  it('reports both variables when both are missing', () => {
    expect(errorsOf({})).toEqual([
      'EXPO_PUBLIC_SUPABASE_URL is missing.',
      'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing.',
    ]);
  });

  it('treats blank values as missing', () => {
    expect(
      errorsOf({ EXPO_PUBLIC_SUPABASE_URL: '   ', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' }),
    ).toHaveLength(2);
  });

  it.each([
    'abcdefgh.supabase.co',
    'ftp://abcdefgh.supabase.co',
    'https://abcdefgh.supabase.co/rest/v1',
    'https://abcdefgh.supabase.co?x=1',
    'https://',
    'not a url',
  ])('rejects the malformed URL %s', (url) => {
    expect(
      errorsOf({
        EXPO_PUBLIC_SUPABASE_URL: url,
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
      })[0],
    ).toMatch(/must be an http\(s\) origin/);
  });

  it('rejects an out-of-range port', () => {
    expect(
      errorsOf({
        EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co:99999',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
      }),
    ).toEqual(['EXPO_PUBLIC_SUPABASE_URL has an invalid port.']);
  });

  it('requires https for non-local hosts', () => {
    expect(
      errorsOf({
        EXPO_PUBLIC_SUPABASE_URL: 'http://abcdefgh.supabase.co',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
      }),
    ).toEqual(['EXPO_PUBLIC_SUPABASE_URL must use https outside local development.']);
  });

  it('refuses a secret key', () => {
    expect(
      errorsOf({
        EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc',
      })[0],
    ).toMatch(/is a secret key/);
  });

  it('refuses a legacy service_role JWT', () => {
    expect(
      errorsOf({
        EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt({ role: 'service_role' }),
      })[0],
    ).toMatch(/is a service_role key/);
  });

  it.each([
    ['without a role', jwt({ iss: 'supabase' })],
    ['with a non-string role', jwt({ role: 7 })],
    ['whose payload is not JSON', 'eyJhbGciOiJIUzI1NiJ9.bm90LWpzb24.c2ln'],
    ['whose payload is JSON null', 'eyJhbGciOiJIUzI1NiJ9.bnVsbA.c2ln'],
  ])('refuses a JWT %s', (_label, key) => {
    expect(
      errorsOf({
        EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
      }),
    ).toEqual([
      'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is a JWT without the anon role; use the publishable key.',
    ]);
  });

  it.each(['anon-key', 'sb_publishable_', 'sb_publishable_has space', 'eyJonly.two'])(
    'rejects the malformed key %s',
    (key) => {
      expect(
        errorsOf({
          EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
          EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
        }),
      ).toEqual([
        'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not a Supabase publishable key (expected sb_publishable_...).',
      ]);
    },
  );

  it('reports URL and key problems together', () => {
    expect(
      errorsOf({ EXPO_PUBLIC_SUPABASE_URL: 'nope', EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'nope' }),
    ).toHaveLength(2);
  });
});

describe('getSupabaseConfig', () => {
  it('returns the config when valid', () => {
    expect(
      getSupabaseConfig({
        EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
      }),
    ).toEqual({
      url: 'https://x.supabase.co',
      publishableKey: PUBLISHABLE,
      keyKind: 'publishable',
    });
  });

  it('throws an EnvError naming every problem and the file to fix', () => {
    let caught: unknown;
    try {
      getSupabaseConfig({});
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(EnvError);
    const envError = caught as EnvError;
    expect(envError.name).toBe('EnvError');
    expect(envError.errors).toHaveLength(2);
    expect(envError.message).toContain('apps/mobile/.env');
    expect(envError.message).toContain('EXPO_PUBLIC_SUPABASE_URL is missing.');
  });
});
