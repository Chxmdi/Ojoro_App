import {
  toOjoroError,
  type OjoroError,
  type RpcArgs,
  type RpcName,
  type RpcReturns,
} from '@ojoro/contracts';

import { supabase } from './supabase';

/** A failed server call, carrying the stable code the UI maps to words. */
export class OjoroCallError extends Error {
  readonly error: OjoroError;
  constructor(error: OjoroError) {
    super(error.code);
    this.name = 'OjoroCallError';
    this.error = error;
  }
}

/**
 * Calls a Postgres function and returns its data, or throws OjoroCallError. All writes go through
 * RPCs (docs/SLICE01_CONTRACT.md); pass the same idempotency key on every retry of one intention.
 */
export async function rpc<N extends RpcName>(name: N, args: RpcArgs<N>): Promise<RpcReturns<N>> {
  const { data, error } = await supabase.rpc(name, args as never);
  if (error) throw new OjoroCallError(toOjoroError(error));
  return data as RpcReturns<N>;
}

/** The OjoroError behind anything a query or mutation threw. */
export function ojoroErrorOf(thrown: unknown): OjoroError {
  return thrown instanceof OjoroCallError ? thrown.error : toOjoroError(thrown);
}
