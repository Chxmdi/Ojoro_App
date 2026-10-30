import { describe, expect, it } from 'vitest';

import { getAdminConfig, jwtRole } from './env';

const jwt = (claims: object) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`;

describe('getAdminConfig', () => {
  it('accepts the local stack and a publishable key', () => {
    expect(
      getAdminConfig({
        VITE_SUPABASE_URL: 'http://127.0.0.1:54321/',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc',
      }),
    ).toEqual({
      ok: true,
      config: { url: 'http://127.0.0.1:54321', publishableKey: 'sb_publishable_abc' },
    });
  });

  it('accepts a legacy anon JWT', () => {
    const r = getAdminConfig({
      VITE_SUPABASE_URL: 'https://x.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: jwt({ role: 'anon' }),
    });
    expect(r.ok).toBe(true);
  });

  it('refuses secret and service-role keys', () => {
    for (const key of ['sb_secret_abc', jwt({ role: 'service_role' }), 'eyJnot-a-jwt']) {
      const r = getAdminConfig({
        VITE_SUPABASE_URL: 'https://x.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: key,
      });
      expect(r.ok).toBe(false);
    }
  });

  it('reports missing and malformed values', () => {
    expect(getAdminConfig({})).toEqual({
      ok: false,
      errors: ['VITE_SUPABASE_URL is missing.', 'VITE_SUPABASE_PUBLISHABLE_KEY is missing.'],
    });
    const r = getAdminConfig({
      VITE_SUPABASE_URL: 'https://x.supabase.co/rest',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'abc',
    });
    expect(r.ok ? [] : r.errors).toHaveLength(2);
    const http = getAdminConfig({
      VITE_SUPABASE_URL: 'http://example.com',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_a',
    });
    expect(http.ok).toBe(false);
  });
});

describe('jwtRole', () => {
  it('reads the role claim or returns undefined', () => {
    expect(jwtRole(jwt({ role: 'anon' }))).toBe('anon');
    expect(jwtRole(jwt({ sub: 'x' }))).toBeUndefined();
    expect(jwtRole(jwt({ role: 3 }))).toBeUndefined();
    expect(jwtRole('nope')).toBeUndefined();
    expect(jwtRole('a.@@@.c')).toBeUndefined();
  });
});
