/**
 * After: the result card (confirm or suggest a fix, the participant threshold), moments and the
 * window line. Pure, so it runs in Node.
 */
import { firstName, weekdayHour } from '../activities/format';

export type Proposal = {
  id: string;
  team_a_score: number;
  team_b_score: number;
  proposed_by: string;
  status: 'proposed' | 'verified' | 'superseded';
  verification_level: 'self_recorded' | 'participant_confirmed';
  confirmations_count: number;
  threshold: number;
  verified_at: string | null;
};

/** The current proposal: proposed or verified (at most one); superseded ones are history. */
export function currentProposal<T extends Pick<Proposal, 'status'>>(rows: readonly T[]): T | null {
  return rows.find((r) => r.status === 'verified') ?? rows.find((r) => r.status === 'proposed') ?? null;
}

/** "AFTER · OPEN UNTIL WED 9 PM", or CLOSED once After has ended. */
export function afterOverline(afterClosesAt: string, now: Date, timeZone?: string): string {
  if (Date.parse(afterClosesAt) <= now.getTime()) return 'AFTER · CLOSED';
  return `AFTER · OPEN UNTIL ${weekdayHour(afterClosesAt, timeZone)}`;
}

/** "90 minutes, 8 players. Lock in the result and the moments while they're fresh." */
export function goodGameLine(minutes: number, players: number, open: boolean): string {
  const facts = `${minutes} minutes, ${players} ${players === 1 ? 'player' : 'players'}.`;
  return open
    ? `${facts} Lock in the result and the moments while they're fresh.`
    : `${facts} After has closed; the recap is final.`;
}

/** "FINAL SCORE · LOGGED BY ADE". */
export function scoreOverline(proposerName: string | null, isMe: boolean): string {
  if (isMe) return 'FINAL SCORE · LOGGED BY YOU';
  return proposerName ? `FINAL SCORE · LOGGED BY ${firstName(proposerName).toUpperCase()}` : 'FINAL SCORE';
}

/** "3 of 8 confirmed. At 4 it becomes Participant confirmed." */
export function thresholdLine(
  proposal: Pick<Proposal, 'confirmations_count' | 'threshold' | 'status'>,
  players: number,
): string {
  const count = `${proposal.confirmations_count} of ${players} confirmed.`;
  if (proposal.status === 'verified') return `${count} Participant confirmed.`;
  return `${count} At ${proposal.threshold} it becomes Participant confirmed.`;
}

/** "Confirmed by 6 of 8 players." */
export function confirmedBy(count: number, players: number): string {
  return `Confirmed by ${count} of ${players} ${players === 1 ? 'player' : 'players'}.`;
}

/** Scores are whole numbers 0–99. */
export const SCORE_MAX = 99;

export function scoreError(a: number, b: number): string | null {
  const ok = (n: number) => Number.isInteger(n) && n >= 0 && n <= SCORE_MAX;
  return ok(a) && ok(b) ? null : `Scores are whole numbers from 0 to ${SCORE_MAX}.`;
}

/** The verified moment: a proposal we saw unverified turned verified. */
export function justVerified(before: string | null, now: string | null): boolean {
  return before === 'proposed' && now === 'verified';
}

/** What the result card offers you. */
export type ResultAction =
  | 'log' // nothing logged yet, you played: log the score
  | 'confirm' // a proposal you haven't confirmed: CONFIRM / SUGGEST A FIX
  | 'confirmed' // you confirmed it
  | 'verified' // it's verified
  | 'watch' // you didn't play: you can see it, not change it
  | 'closed'; // After has closed

export function resultAction(input: {
  proposal: Pick<Proposal, 'status'> | null;
  iConfirmed: boolean;
  iPlayed: boolean;
  open: boolean;
}): ResultAction {
  const { proposal, iConfirmed, iPlayed, open } = input;
  if (proposal?.status === 'verified') return 'verified';
  if (!open) return 'closed';
  if (!iPlayed) return 'watch';
  if (!proposal) return 'log';
  return iConfirmed ? 'confirmed' : 'confirm';
}

/** "Only the 8 who played can add photos. Anyone can be untagged." */
export function momentsNote(players: number): string {
  return `Only the ${players} who played can add photos. Anyone can be untagged.`;
}

/** Where a moment goes in the `moments` bucket: `{activityId}/{userId}/{uuid}.{ext}`. */
export function momentPath(activityId: string, userId: string, id: string, ext: string): string {
  const clean = ext.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  return `${activityId}/${userId}/${id}.${clean === 'jpeg' ? 'jpg' : clean}`;
}

/** The file type from a picked asset's mime type or name. */
export function photoExtension(mimeType: string | null | undefined, fileName?: string | null): string {
  const fromMime = mimeType?.split('/')[1];
  if (fromMime && ['jpeg', 'jpg', 'png', 'webp', 'heic'].includes(fromMime)) return fromMime;
  const fromName = fileName?.split('.').pop()?.toLowerCase();
  if (fromName && ['jpeg', 'jpg', 'png', 'webp', 'heic'].includes(fromName)) return fromName;
  return 'jpg';
}

export function contentType(ext: string): string {
  const e = ext === 'jpg' ? 'jpeg' : ext;
  return `image/${e}`;
}

/** Alt text is required (the Image component reads it); 3–200 characters. */
export function altTextError(alt: string): string | null {
  const t = alt.trim();
  if (t.length < 3) return 'Say what is in the photo, in a few words.';
  if (t.length > 200) return 'Keep it under 200 characters.';
  return null;
}

/** "Photo: Ade", or "Photo: you". */
export function photoCredit(authorName: string | null, isMe: boolean): string {
  if (isMe) return 'Photo: you';
  return `Photo: ${authorName ? firstName(authorName) : 'a player'}`;
}
