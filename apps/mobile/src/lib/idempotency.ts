import { randomUUID } from 'expo-crypto';

/**
 * A key for one user intention (one I'M DOWN tap, one check-in). Create it when the intention
 * starts and reuse it for every retry, so the server applies the mutation once.
 */
export function newIdempotencyKey(): string {
  return randomUUID();
}
