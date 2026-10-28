import { returnablePath } from './gate';

/**
 * The deep link someone opened before signing in (a plan, a game), kept in memory until the gate
 * lets them through. One at a time: the latest link wins.
 */
let pending: string | null = null;

export function rememberReturnTo(pathname: string | null | undefined): void {
  const path = returnablePath(pathname);
  if (path) pending = path;
}

export function peekReturnTo(): string | null {
  return pending;
}

export function consumeReturnTo(): string | null {
  const path = pending;
  pending = null;
  return path;
}
