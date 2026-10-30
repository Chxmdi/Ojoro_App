/** Longest goal the block sets in display type before it gets unwieldy. */
export const GOAL_MAX_LENGTH = 60;

/**
 * The goal as a display headline: trimmed, collapsed spaces, caps, one full
 * stop ("Sub-22 5K by December" → "SUB-22 5K BY DECEMBER."). Empty → null.
 * Ends that are already punctuation keep theirs, but "!" becomes "." (no
 * exclamation marks in product type).
 */
export function goalHeadline(title: string | null | undefined): string | null {
  const t = (title ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const upper = t.toUpperCase().replace(/!+$/, '.');
  return /[.?]$/.test(upper) ? upper : `${upper}.`;
}

/** One sentence for screen readers: "Goal: Sub-22 5K by December. Best so far: 23:05. Next step: Tempo run." */
export function goalLabel({
  title,
  body,
  nextStep,
}: {
  title?: string | null | undefined;
  body?: string | undefined;
  nextStep?: string | undefined;
}): string {
  const t = (title ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return 'Goal: none set.';
  const parts = [`Goal: ${t.replace(/[.!]+$/, '')}.`];
  if (body) parts.push(body.trim());
  if (nextStep) parts.push(`Next step: ${nextStep.trim().replace(/\.$/, '')}.`);
  return parts.join(' ');
}
