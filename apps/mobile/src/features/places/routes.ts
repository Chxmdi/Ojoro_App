/**
 * Routes into Places and Pulse (docs/PLACES_CONTRACT.md). Shared by Discover, Pulse, Place and the
 * create form so every entry point opens the same screens.
 */
import type { Href } from 'expo-router';

export const placeRoutes = {
  /** `/place/[id]`: Place.png. */
  place: (id: string) => ({ pathname: '/place/[id]', params: { id } }) as unknown as Href,
  /** `/pulse`: Pulse.png. A place id preselects its sheet. */
  pulse: (placeId?: string | null) =>
    (placeId ? { pathname: '/pulse', params: { place: placeId } } : '/pulse') as unknown as Href,
  /**
   * The existing create form (`/create/plan`), prefilled with the place, and its sport and suggested
   * start when known (`placeCreatePrefill`). The user still confirms there.
   */
  createHere: (placeId: string, sportId?: string | null, startsAt?: string | null) =>
    ({
      pathname: '/create/plan',
      params: {
        place: placeId,
        ...(sportId ? { sport: sportId } : null),
        ...(startsAt ? { at: startsAt } : null),
      },
    }) as unknown as Href,
};
