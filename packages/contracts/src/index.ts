export const serviceName = 'contracts' as const;

export function describeService() {
  return { name: serviceName, status: 'ready' as const };
}

// Generated from the local Supabase schema (`pnpm db:types`). Do not edit by hand.
export * from './database.types';
// Slice 01 client contract helpers (docs/SLICE01_CONTRACT.md).
export * from './slice01';
