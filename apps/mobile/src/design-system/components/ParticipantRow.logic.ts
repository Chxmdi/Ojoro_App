/**
 * Pure rules for `ParticipantRow` (`ROLE` map and `.oj-prow` in the web
 * reference; components/ParticipantRow.md). No React Native imports.
 */

export const PARTICIPANT_ROLES = ['host', 'in', 'invited', 'maybe', 'checked'] as const;
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];

/** The word on the row's badge, as the web reference writes it. */
export const ROLE: Record<ParticipantRole, string> = {
  host: 'HOST',
  in: "I'M DOWN",
  invited: 'INVITED',
  maybe: 'MAYBE',
  checked: 'CHECKED IN',
};

/** The web reads `ROLE[role].toLowerCase()`; "I'm" keeps its capital here. */
const SPOKEN: Record<ParticipantRole, string> = {
  host: 'host',
  in: "I'm down",
  invited: 'invited',
  maybe: 'maybe',
  checked: 'checked in',
};

export function roleWord(role: ParticipantRole | undefined): string {
  return ROLE[role ?? 'in'];
}

export function roleSpoken(role: ParticipantRole | undefined): string {
  return SPOKEN[role ?? 'in'];
}

/** What the row draws after the name: the status badge, the verified check-in mark, or nothing. */
export type RoleMark =
  { kind: 'badge'; tone: 'signal' | 'neutral'; text: string } | { kind: 'verified' };

export function roleMark(role: ParticipantRole | undefined): RoleMark {
  const r = role ?? 'in';
  if (r === 'checked') return { kind: 'verified' };
  return { kind: 'badge', tone: r === 'host' ? 'signal' : 'neutral', text: ROLE[r] };
}

/** Sort order from the spec: host first, then checked in, in, maybe, invited. */
const ORDER: Record<ParticipantRole, number> = { host: 0, checked: 1, in: 2, maybe: 3, invited: 4 };

/** A stable sort of participants by role, for lists of rows. Doesn't mutate. */
export function sortParticipants<T extends { role?: ParticipantRole | undefined }>(
  rows: readonly T[],
): T[] {
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => ORDER[a.row.role ?? 'in'] - ORDER[b.row.role ?? 'in'] || a.i - b.i)
    .map(({ row }) => row);
}

/**
 * The row read aloud: name, then status (web: `name + ', ' + role`), then the
 * context line, then any custom trailing words. Empty parts are skipped.
 */
export function participantLabel(parts: {
  name: string;
  status?: string | undefined;
  meta?: string | undefined;
  trailing?: string | undefined;
}): string {
  return [parts.name, parts.status, parts.meta, parts.trailing]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(', ');
}
