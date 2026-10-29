/**
 * Pure rules for `ReactionBar` (`function ReactionBar` and `.oj-reaction` in
 * the web reference; components/ReactionBar.md). No React Native imports.
 */

/** The fixed vocabulary, in this order. Reactions are words, never icons or emoji. */
export const REACTIONS = ['LET’S GO', 'RESPECT', 'HOLD THAT', 'RUN IT BACK'] as const;

export type ReactionWord = (typeof REACTIONS)[number];

export type Reaction = {
  label: string;
  count: number;
  /** You reacted with this one. */
  mine?: boolean | undefined;
};

/** A count as shown: whole, never negative. */
export function reactionCount(count: number): number {
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

/** The word read aloud in sentence case: "Let’s go", "Run it back". */
export function reactionWord(label: string): string {
  const lower = label.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Toggle button label: "Respect, 14, you reacted" (web `aria-label`, in sentence case). */
export function reactionLabel(reaction: Reaction): string {
  return [
    reactionWord(reaction.label),
    String(reactionCount(reaction.count)),
    reaction.mine ? 'you reacted' : null,
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * The optimistic toggle: flips `mine` on `label` and moves its count by one.
 * Screens apply it at once on tap, then reconcile with the server's counts
 * (or apply it again to roll back if the write fails). Other reactions are
 * untouched: a person can hold more than one.
 */
export function toggleReaction<R extends Reaction>(reactions: readonly R[], label: string): R[] {
  return reactions.map((r) => {
    if (r.label !== label) return r;
    const mine = !r.mine;
    return { ...r, mine, count: reactionCount(r.count + (mine ? 1 : -1)) };
  });
}
