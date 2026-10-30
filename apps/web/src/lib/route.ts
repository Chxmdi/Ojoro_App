/**
 * Hash routes for the admin tool (#/queue?severity=high). A hash router keeps the build a static
 * bundle that any host can serve, with no server rewrites.
 */

export type Route =
  | { name: 'queue'; params: Record<string, string> }
  | { name: 'report'; id: string }
  | { name: 'appeals'; params: Record<string, string> }
  | { name: 'audit'; params: Record<string, string> }
  | { name: 'places'; params: Record<string, string> }
  | { name: 'people'; params: Record<string, string> }
  | { name: 'person'; id: string };

export const DEFAULT_ROUTE: Route = { name: 'queue', params: {} };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseQuery(query: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(query)) if (value !== '') out[key] = value;
  return out;
}

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  const [path = '', query = ''] = raw.split('?', 2);
  const segments = path.split('/').filter(Boolean);
  const params = parseQuery(query);
  switch (segments[0]) {
    case 'queue':
      return { name: 'queue', params };
    case 'reports':
      return segments[1] && UUID.test(segments[1])
        ? { name: 'report', id: segments[1].toLowerCase() }
        : DEFAULT_ROUTE;
    case 'appeals':
      return { name: 'appeals', params };
    case 'audit':
      return { name: 'audit', params };
    case 'places':
      return { name: 'places', params };
    case 'people':
      if (segments[1])
        return UUID.test(segments[1])
          ? { name: 'person', id: segments[1].toLowerCase() }
          : DEFAULT_ROUTE;
      return { name: 'people', params };
    default:
      return DEFAULT_ROUTE;
  }
}

export function formatRoute(route: Route): string {
  if (route.name === 'report') return `#/reports/${route.id}`;
  if (route.name === 'person') return `#/people/${route.id}`;
  const query = new URLSearchParams(
    Object.entries(route.params)
      .filter(([, v]) => v !== '')
      .sort(([a], [b]) => a.localeCompare(b)),
  ).toString();
  return `#/${route.name}${query ? `?${query}` : ''}`;
}

/** The same route with some params changed; '' or undefined drops a param. Changing a filter resets paging. */
export function withParams(
  route: Exclude<Route, { name: 'report' } | { name: 'person' }>,
  changes: Record<string, string | undefined>,
): Route {
  const params: Record<string, string> = { ...route.params };
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === '') delete params[key];
    else params[key] = value;
  }
  if (!('page' in changes)) delete params.page;
  return { name: route.name, params } as Route;
}

/** Page number from params: a positive integer, default 1. */
export function pageOf(params: Record<string, string>): number {
  const n = Number(params.page);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}
