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
 * The optimistic toggle, with the server's rule: one word per person per post.
 * Tapping the word you hold takes it back; tapping another moves your reaction
 * there (the old word loses one). Screens apply it at once on tap, keep the
 * previous list to roll back to if the write fails, then reconcile with the
 * server's counts.
 */
export function toggleReaction<R extends Reaction>(reactions: readonly R[], label: string): R[] {
  if (!reactions.some((r) => r.label === label)) return [...reactions];
  return reactions.map((r) => {
    if (r.label === label) {
      const mine = !r.mine;
      return { ...r, mine, count: reactionCount(r.count + (mine ? 1 : -1)) };
    }
    if (r.mine) return { ...r, mine: false, count: reactionCount(r.count - 1) };
    return r;
  });
}
