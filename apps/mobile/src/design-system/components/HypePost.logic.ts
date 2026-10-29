/**
 * Pure rules for `HypePost` (`function HypePost` and `.oj-post*` in the web
 * reference; components/HypePost.md). No React Native imports.
 */

export const HYPE_POST_KINDS = ['competitor', 'system', 'supporter', 'evidence'] as const;
export type HypePostKind = (typeof HYPE_POST_KINDS)[number];

export type HypeStat = { value: string; label: string };

/** The kind is named in words, not colour (`POST_KIND`). */
export const POST_KIND: Record<HypePostKind, string> = {
  competitor: 'COMPETITOR',
  system: 'OJORO',
  supporter: 'SUPPORTER',
  evidence: 'TRAINING',
};

/** The badge: "COMPETITOR · CHIMDI", "TRAINING", … */
export function postBadge(kind: HypePostKind, side: string | undefined): string {
  return POST_KIND[kind] + (side ? ` · ${side}` : '');
}

/** The system strip's overline: "UPDATE · 8:01", or UPDATE alone (the web leaves a trailing dot). */
export function systemOverline(time: string | undefined): string {
  return time ? `UPDATE · ${time}` : 'UPDATE';
}

/** Competitors get the `md` avatar and the larger 18/26 body; everyone else `sm`. */
export function postAvatarSize(kind: HypePostKind): 'sm' | 'md' {
  return kind === 'competitor' ? 'md' : 'sm';
}

/** Stats show on evidence posts only, and only when there are some. */
export function showsStats(kind: HypePostKind, stats: readonly HypeStat[] | undefined): boolean {
  return kind === 'evidence' && !!stats && stats.length > 0;
}

/**
 * The post read as one item, in visual order:
 * "Marcus T, training, Marcus, 3h. Last tempo run before Saturday. 5.2 KM distance, 23:48 time."
 * System: "Ojoro update, 8:01. GOAL · MARCUS. LIGHTS LEAD 3–2."
 */
export function hypePostLabel(p: {
  kind: HypePostKind;
  author?: string | undefined;
  body: string;
  time?: string | undefined;
  side?: string | undefined;
  stats?: readonly HypeStat[] | undefined;
}): string {
  if (p.kind === 'system') {
    return `${['Ojoro update', p.time].filter(Boolean).join(', ')}. ${p.body}`;
  }
  const side = p.side ? p.side.charAt(0) + p.side.slice(1).toLowerCase() : undefined;
  const head = [p.author, POST_KIND[p.kind].toLowerCase(), side, p.time].filter(Boolean).join(', ');
  const stats = showsStats(p.kind, p.stats)
    ? ` ${(p.stats ?? []).map((s) => `${s.value} ${s.label}`).join(', ')}.`
    : '';
  return `${head}. ${p.body}${stats}`;
}

/**
 * Ojoro's update strip is `inverse` (black). On `confirmed` (oxblood) the two
 * merge at 1.09:1, so the strip gets the 2px white `mark-ring` there.
 */
export function systemNeedsRing(situation: string): boolean {
  return situation === 'confirmed';
}
