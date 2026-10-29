import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  LATENT_DEMAND_K,
  createFromDemandArgs,
  idempotentRpcs,
  liquidityErrorCodes,
  liquidityIdempotentRpcs,
  liquidityRpcs,
  loggedReadRpcs,
  ojoroErrorCodes,
  toOjoroError,
} from './index';

const migrationsDir = new URL('../../../supabase/migrations/', import.meta.url);
const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(new URL(f, migrationsDir), 'utf8'))
  .join('\n');

describe('liquidity contract drift (CI-safe, no database needed)', () => {
  it('every Step 3 RPC is defined in a migration', () => {
    for (const name of liquidityRpcs) {
      expect(migrations, name).toMatch(new RegExp(`function public\\.${name}\\(`));
    }
  });

  it('idempotent Step 3 RPCs take p_idempotency_key and are listed with the others', () => {
    for (const name of liquidityIdempotentRpcs) {
      const start = migrations.indexOf(`function public.${name}(`);
      const signature = migrations.slice(start, migrations.indexOf(')\nreturns', start));
      expect(signature, name).toContain('p_idempotency_key uuid');
      expect(idempotentRpcs as readonly string[]).toContain(name);
    }
  });

  it('reads that log analytics are volatile', () => {
    for (const name of loggedReadRpcs) {
      const start = migrations.lastIndexOf(`function public.${name}(`);
      const header = migrations.slice(start, migrations.indexOf('as $$', start));
      expect(header, name).toMatch(/\bvolatile\b/);
    }
  });

  it('Step 3 error codes are raised and mapped', () => {
    for (const code of liquidityErrorCodes) {
      expect(migrations).toContain(`private.fail('${code}'`);
      expect(ojoroErrorCodes as readonly string[]).toContain(code);
      expect(toOjoroError({ code: 'P0001', message: code }).kind).toBe('ojoro');
    }
  });

  it('k matches the database', () => {
    expect(migrations).toMatch(
      new RegExp(
        `function private\\.latent_demand_k\\(\\)[\\s\\S]*?select ${LATENT_DEMAND_K} \\$\\$`,
      ),
    );
  });
});

describe('createFromDemandArgs', () => {
  it('starts at the suggested time and ends with the bucket', () => {
    expect(
      createFromDemandArgs(
        {
          sport_id: 'volleyball',
          suggested_start: '2026-10-29T23:00:00Z',
          window_end: '2026-10-30T04:00:00Z',
        },
        'k',
      ),
    ).toEqual({
      p_sport_id: 'volleyball',
      p_window_start: '2026-10-29T23:00:00Z',
      p_window_end: '2026-10-30T04:00:00Z',
      p_idempotency_key: 'k',
    });
  });
});
