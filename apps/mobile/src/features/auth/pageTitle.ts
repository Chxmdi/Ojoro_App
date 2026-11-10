/**
 * The document title for each route on the web (WCAG 2.4.2; axe `document-title`). Expo Router
 * turns React Navigation's document title off, so the root layout sets it from the pathname.
 * Sentence case in Ojoro's voice; product verbs keep their caps. iOS and Android don't use it.
 */

/** Pathname patterns, most specific first. `:id` matches one segment. */
const TITLES: readonly (readonly [string, string])[] = [
  ['/welcome', 'Ojoro'],
  ['/phone', "What's your number"],
  ['/code', 'Enter the code'],
  ['/name', 'What people call you'],
  ['/sports', 'What you play'],
  ['/when', "When you're free"],
  ['/area', 'Where you play'],
  ['/privacy', 'Who sees what'],
  ['/', 'Home'],
  ['/discover', 'Discover'],
  ['/create', 'Create'],
  ['/create/plan', 'Quick plan'],
  ['/compete', 'Compete'],
  ['/you', 'You'],
  ['/updates', 'Updates'],
  ['/pulse', 'Pulse'],
  ['/passport', 'Passport'],
  ['/profile/:id', 'Profile'],
  ['/profile/:id/passport', 'Passport'],
  ['/plan/:id', 'Plan'],
  ['/plan/:id/pull-in', 'PULL SOMEONE IN'],
  ['/plan/:id/game-on', 'GAME ON'],
  ['/activity/:id', 'Activity'],
  ['/activity/:id/chat', 'Chat'],
  ['/activity/:id/check-in', 'Check in'],
  ['/activity/:id/live', 'Live'],
  ['/activity/:id/after', 'After the game'],
  ['/activity/:id/recap', 'Recap'],
  ['/activity/:id/run-it-back', 'RUN IT BACK'],
  ['/challenge/new', 'CALL OUT'],
  ['/challenge/:id', 'Call-Out'],
  ['/event/:id', 'Challenge Event'],
  ['/event/:id/poster', 'Share the poster'],
  ['/rivalry/:id', 'Rivalry'],
  ['/crew', 'Crews'],
  ['/crew/new', 'Start a crew'],
  ['/crew/join', 'Join a crew'],
  ['/crew/:id', 'Crew'],
  ['/crew/:id/chat', 'Crew chat'],
  ['/clan/:id', 'Clan'],
  ['/clan/join/:id', 'Join a clan'],
  ['/clash/:id', 'Ojoro Clash'],
  ['/place/:id', 'Place'],
  ['/pay', 'Passes and payments'],
  ['/pay/program/:id', 'Passes'],
  ['/pay/return', 'Payment'],
  ['/settings/account', 'Account'],
  ['/settings/delete-account', 'Delete your account'],
  ['/settings/area', 'Your area'],
  ['/settings/blocked', 'Blocked people'],
  ['/settings/notifications', 'Notifications'],
  ['/settings/privacy', 'Who sees what'],
  ['/host/:id', 'Hosting'],
  ['/host/:id/series/:id', 'Series'],
  ['/host/:id/session/:id', 'Session'],
  ['/host/:id/session/:id/requests', 'Requests'],
  ['/host/:id/people', 'People'],
  ['/host/:id/payments', 'Memberships and payments'],
  ['/host/:id/announce', 'Announcement'],
  ['/host/:id/insights', 'Insights'],
  ['/host/:id/league/:id', 'League'],
  ['/storybook', 'Storybook'],
];

const SUFFIX = ' · Ojoro';

function segments(path: string): string[] {
  return path.split('/').filter(Boolean);
}

function matches(pattern: string[], path: string[]): boolean {
  return (
    pattern.length === path.length &&
    pattern.every((part, i) => part === ':id' || part === path[i])
  );
}

/** "Plan · Ojoro" for `/plan/…`; "Nothing here · Ojoro" for a route Ojoro doesn't have. */
export function pageTitle(pathname: string): string {
  const path = segments(pathname.split(/[?#]/)[0] ?? '');
  // Literal routes beat patterns: /challenge/new is not a Call-Out with id "new".
  const exact = TITLES.find(([p]) => !p.includes(':') && matches(segments(p), path));
  const found = exact ?? TITLES.find(([p]) => matches(segments(p), path));
  const title = found?.[1] ?? 'Nothing here';
  return title === 'Ojoro' ? title : `${title}${SUFFIX}`;
}
