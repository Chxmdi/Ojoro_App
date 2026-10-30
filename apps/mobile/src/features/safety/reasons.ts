import type { Database } from '@ojoro/contracts';

export type ReportReason = Database['public']['Enums']['report_reason'];
export type ReportSubjectKind = Database['public']['Enums']['report_subject'];

/** The `report` RPC's reasons, in the order the sheet lists them, with their words. */
export const REPORT_REASONS: readonly { value: ReportReason; label: string }[] = [
  { value: 'unsafe', label: 'Unsafe behaviour' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'impersonation', label: 'Pretending to be someone' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'spam', label: 'Spam' },
  { value: 'other', label: 'Something else' },
];

/** What's being reported, as the sheet says it ("Report this plan"). */
const SUBJECT_WORDS: Record<ReportSubjectKind, string> = {
  profile: 'profile',
  plan: 'plan',
  activity: 'game',
  moment: 'photo',
  result: 'score',
  message: 'message',
  update: 'update',
  call_out: 'Call-Out',
  challenge_event: 'event',
  challenge_post: 'post',
  challenge_comment: 'comment',
  rivalry: 'rivalry',
  // Step 6: communities (docs/COMMUNITIES_CONTRACT.md)
  crew: 'crew',
  clan: 'clan',
  clan_run: 'run',
  clash: 'Clash',
  // Step 6: hosts (docs/HOSTS_CONTRACT.md)
  host_program: 'program',
};

export function subjectWord(kind: ReportSubjectKind): string {
  return SUBJECT_WORDS[kind];
}

/** Notes are optional and short; the server stores them with the report. */
export const REPORT_NOTE_MAX = 500;

export type ReportDraft = { reason: ReportReason | null; note: string };

export type ReportValidation =
  | { ok: true; reason: ReportReason; note: string | null }
  | { ok: false; error: string };

/** Checks a report before sending. "Something else" needs a few words to be useful. */
export function validateReport(draft: ReportDraft): ReportValidation {
  const note = draft.note.trim();
  if (!draft.reason) return { ok: false, error: 'Pick what happened.' };
  if (note.length > REPORT_NOTE_MAX) {
    return { ok: false, error: `Keep the note under ${REPORT_NOTE_MAX} characters.` };
  }
  if (draft.reason === 'other' && note.length === 0) {
    return { ok: false, error: 'Say what happened in a few words.' };
  }
  return { ok: true, reason: draft.reason, note: note.length > 0 ? note : null };
}

/** The first name, for buttons that must stay short ("BLOCK ADE"). */
export function firstName(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first && first.length > 0 ? first : name.trim();
}

/** The block confirmation, in consequences (Modal: a costly choice gets an explicit answer). */
export function blockCopy(name: string): { title: string; body: string; confirm: string } {
  const first = firstName(name);
  return {
    title: `BLOCK ${first.toUpperCase()}?`,
    body: `${first} won't see you, your plans or your games, and you won't see theirs. Open invites between you end. ${first} isn't told. You can unblock from Settings.`,
    confirm: 'BLOCK',
  };
}
