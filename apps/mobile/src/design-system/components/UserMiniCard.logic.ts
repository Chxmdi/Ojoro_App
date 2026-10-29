/**
 * Pure rules for `UserMiniCard` (web reference `function UserMiniCard` and
 * `.oj-usercard*` in bundle.css; components/UserMiniCard.md). No React Native
 * imports, so it runs in Node.
 *
 * Privacy: the card carries identity, sports and counts only. There is no
 * availability field, so it can't show a calendar or a schedule; the reason
 * two people overlap ("you both run on Saturdays") is overlap wording the
 * screen writes above the card, never something the card derives.
 */

/** A count on the card: "61" over "Sessions". Counts only, never scores or levels. */
export type UserStat = { value: string; label: string };

export type UserMiniCardParts = {
  name: string;
  handle: string;
  area?: string | undefined;
  verified?: boolean | undefined;
  sports?: readonly string[] | undefined;
  stats?: readonly UserStat[] | undefined;
};

/** "@adeb · Mile End" (the web prefixes the handle with @ and adds the area after a middle dot). */
export function userMeta({ handle, area }: Pick<UserMiniCardParts, 'handle' | 'area'>): string {
  const at = `@${handle.replace(/^@/, '')}`;
  return area ? `${at} · ${area}` : at;
}

/** Sports and stats with blanks dropped, so an empty row never draws its rule or gap. */
export function userRows({ sports, stats }: Pick<UserMiniCardParts, 'sports' | 'stats'>) {
  return {
    sports: (sports ?? []).map((s) => s.trim()).filter(Boolean),
    stats: (stats ?? []).filter((s) => s.value.trim() !== '' && s.label.trim() !== ''),
  };
}

/** "football", "football and running", "football, running and boxing". */
function listInWords(items: readonly string[]): string {
  const lower = items.map((s) => s.toLowerCase());
  if (lower.length <= 1) return lower.join('');
  return `${lower.slice(0, -1).join(', ')} and ${lower[lower.length - 1]}`;
}

/** "Games with you" → "games with you"; keeps acronyms ("KM run") as written. */
function lowerFirst(label: string): string {
  return /^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label;
}

/**
 * The card read as one sentence: "Ade B, @adeb, Mile End, ID verified. Plays
 * football and running. 61 sessions, 6 games with you, 2 crews." The web reads
 * only "name, sports"; handle, area, the badge and the counts are visible, so
 * they're read too.
 */
export function userMiniCardLabel(p: UserMiniCardParts): string {
  const { sports, stats } = userRows(p);
  const who = [p.name, `@${p.handle.replace(/^@/, '')}`, p.area, p.verified ? 'ID verified' : null]
    .filter(Boolean)
    .join(', ');
  const parts = [`${who}.`];
  if (sports.length) parts.push(`Plays ${listInWords(sports)}.`);
  if (stats.length)
    parts.push(`${stats.map((s) => `${s.value} ${lowerFirst(s.label)}`).join(', ')}.`);
  return parts.join(' ');
}

export type UserMiniCardActions = {
  /** FOLLOW (primary) or FOLLOWING (secondary, pressed). Null when there's no `onFollow`. */
  follow: {
    label: 'FOLLOW' | 'FOLLOWING';
    variant: 'primary' | 'secondary';
    pressed: boolean;
  } | null;
  /** CALL OUT, always a ghost after FOLLOW. False when there's no `onCallOut`. */
  callOut: boolean;
};

/**
 * Which buttons show. The web always draws both; a button with nothing to do
 * is a dead control (your own card, someone you've blocked), so each is drawn
 * only when its handler is given. CALL OUT never outranks FOLLOW: it's a ghost.
 */
export function userMiniCardActions({
  following,
  hasFollow,
  hasCallOut,
}: {
  following?: boolean | undefined;
  hasFollow: boolean;
  hasCallOut: boolean;
}): UserMiniCardActions {
  return {
    follow: hasFollow
      ? following
        ? { label: 'FOLLOWING', variant: 'secondary', pressed: true }
        : { label: 'FOLLOW', variant: 'primary', pressed: false }
      : null,
    callOut: hasCallOut,
  };
}
