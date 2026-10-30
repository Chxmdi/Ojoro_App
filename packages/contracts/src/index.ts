export const serviceName = 'contracts' as const;

export function describeService() {
  return { name: serviceName, status: 'ready' as const };
}

// Generated from the local Supabase schema (`pnpm db:types`). Do not edit by hand.
export * from './database.types';
// Slice 01 client contract helpers (docs/SLICE01_CONTRACT.md).
export * from './slice01';
// Step 3 (Liquidity) client contract helpers (docs/LIQUIDITY_CONTRACT.md).
export * from './liquidity';
// Step 4 (Messaging and feed) client contract helpers (docs/MESSAGING_CONTRACT.md).
export * from './messaging';
// Step 5 (Competition) client contract helpers (docs/COMPETITION_CONTRACT.md).
export * from './competition';
// Step 6 (Host OS core) client contract helpers (docs/HOSTS_CONTRACT.md).
export * from './hosts';
// Step 6 (Communities: Crew Home, Clans, Ojoro Clash) client contract helpers (docs/COMMUNITIES_CONTRACT.md).
export * from './communities';
// Step 6 (Host OS operations: passes, ledger, refunds, leagues, insights) client contract helpers
// (docs/HOSTS_OPS_CONTRACT.md).
export * from './hostsOps';
// Step 7 (Places and Ojoro Pulse) client contract helpers (docs/PLACES_CONTRACT.md).
export * from './places';
// Step 7 (Passport, goals, achievements, reputation) client contract helpers (docs/PASSPORT_CONTRACT.md).
export * from './passport';
// Step 8 (Trust and safety: staff, moderation queue, pauses, appeals) client contract helpers
// (docs/TRUST_CONTRACT.md).
export * from './trust';
// Step 8 (Payments: Stripe Connect, Checkout, webhook ledger; test mode only) client contract helpers
// (docs/PAYMENTS_CONTRACT.md).
export * from './payments';
// Step 8 (AI Movement Concierge: the `concierge` Edge Function) client contract helpers
// (docs/CONCIERGE_CONTRACT.md).
export * from './concierge';
