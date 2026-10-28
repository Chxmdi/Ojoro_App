/**
 * Pure rules for `Comment` (`function Comment` and `.oj-comment*` in the web
 * reference; components/Comment.md). No React Native imports.
 */

/** RESPECT is the only like. "RESPECT · 14", "RESPECTED · 15", or the bare word with no count. */
export function respectWord(respect: number | undefined, respected: boolean | undefined): string {
  const word = respected ? 'RESPECTED' : 'RESPECT';
  return respect && respect > 0 ? `${word} · ${Math.floor(respect)}` : word;
}

/** "Respect, 14", "Respected, 15": the middle dot isn't read aloud. */
export function respectLabel(respect: number | undefined, respected: boolean | undefined): string {
  const word = respected ? 'Respected' : 'Respect';
  return respect && respect > 0 ? `${word}, ${Math.floor(respect)}` : word;
}

/** "3 REPLIES" / "1 REPLY", or null with none. */
export function repliesWord(replies: number | undefined): string | null {
  if (!replies || replies <= 0) return null;
  const n = Math.floor(replies);
  return `${n} ${n === 1 ? 'REPLY' : 'REPLIES'}`;
}

/** Reply indent (`.oj-comment.is-reply { padding-left: 40px }`): one level, never deeper. */
export const REPLY_INDENT = 40;

/** The comment read aloud as one item: "Marcus T, competitor, 8m, Mornings don't win races." */
export function commentLabel(
  author: string,
  badge: string | undefined,
  time: string | undefined,
  body: string,
): string {
  return [author, badge?.toLowerCase(), time, body].filter(Boolean).join(', ');
}
