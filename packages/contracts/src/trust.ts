/**
 * Step 8 (Trust and safety, PRD §11.1, §11.3, §9.17, §20) client contract helpers for the app (account
 * status, appeals, missed games) and for the staff admin web app (the moderation queue, cases, people,
 * appeals, the audit log, and staff writes). The full contract is docs/TRUST_CONTRACT.md; every jsonb
 * shape the RPCs return is typed here.
 *
 * Pure TypeScript with no runtime dependencies.
 */
import type { Database } from './database.types';

type Functions = Database['public']['Functions'];
type Enums = Database['public']['Enums'];
type RpcName = keyof Functions;

/** The app's trust RPCs (any signed-in person). */
export const trustRpcs = [
  'my_account_status',
  'my_appeals',
  'my_missed_games',
  'submit_appeal',
  'my_staff_role',
] as const satisfies readonly RpcName[];

/** Staff-only RPCs (the admin web app). Each raises `not_staff` for anyone else. */
export const staffRpcs = [
  'staff_queue',
  'staff_case',
  'staff_user',
  'staff_find_users',
  'staff_appeals',
  'staff_appeal',
  'staff_audit_log',
  'staff_places',
  'staff_assign_case',
  'staff_unassign_case',
  'staff_resolve_case',
  'staff_hide_content',
  'staff_restore_content',
  'staff_pause_account',
  'staff_restore_account',
  'staff_decide_appeal',
  'staff_void_reputation',
  'staff_set_place_sensitive',
  'staff_set_role',
] as const satisfies readonly RpcName[];

/** Staff reads (each writes an audit row; they are volatile, call them with POST like any rpc()). */
export const staffReadRpcs = [
  'staff_queue',
  'staff_case',
  'staff_user',
  'staff_find_users',
  'staff_appeals',
  'staff_appeal',
  'staff_audit_log',
  'staff_places',
] as const satisfies readonly (typeof staffRpcs)[number][];

/** Trust RPCs that take `p_idempotency_key` (one uuid per intention, reused on retry). */
export const trustIdempotentRpcs = [
  'submit_appeal',
  'staff_assign_case',
  'staff_unassign_case',
  'staff_resolve_case',
  'staff_hide_content',
  'staff_restore_content',
  'staff_pause_account',
  'staff_restore_account',
  'staff_decide_appeal',
  'staff_void_reputation',
  'staff_set_place_sensitive',
  'staff_set_role',
] as const satisfies readonly RpcName[];

/** RPCs that still work while the account is paused. */
export const pausedExemptRpcs = [
  'my_account_status',
  'my_appeals',
  'submit_appeal',
  'my_staff_role',
] as const;

/** Stable error codes added by the trust backend (also part of `ojoroErrorCodes`). */
export const trustErrorCodes = [
  'account_paused',
  'not_staff',
  'not_admin',
  'staff_last_admin',
  'case_not_found',
  'case_closed',
  'cannot_hide_kind',
  'hide_not_found',
  'cannot_pause_staff',
  'pause_end_invalid',
  'reason_required',
  'appeal_not_found',
  'appeal_closed',
  'appeal_exists',
  'appeal_not_allowed',
  'appeal_rate_limited',
  'join_request_rate_limited',
  'announcement_rate_limited',
] as const;

/** Notification types the trust backend sends (object_kind `account`, object_id = the recipient). */
export const trustNotificationTypes = [
  'account_paused',
  'account_restored',
  'appeal_decided',
] as const satisfies readonly Enums['notification_type'][];

/** Shown as the host of history kept after an account is deleted (`private.former_member()`). */
export const FORMER_MEMBER_ID = 'f0000000-0000-4000-8000-000000000000';

// Constants ----------------------------------------------------------------------------------------------------

export const STAFF_PAGE_DEFAULT = 50;
export const STAFF_PAGE_MAX = 100;
export const REASON_MAX = 500;
export const NOTE_TO_USER_MAX = 500;
export const APPEAL_MESSAGE_MAX = 1000;
/** A pause ends at most this many days ahead (or has no end). */
export const PAUSE_MAX_DAYS = 365;
/** Appeals a person can send in 7 days. */
export const APPEALS_PER_WEEK = 5;
export const RATE_LIMITS = {
  reports: { max: 20, per: '24 hours' },
  messages: { max: 20, per: 'minute' },
  updates: { max: 6, per: 'minute' },
  challengePosts: { max: 6, per: 'minute' },
  challengeComments: { max: 10, per: 'minute' },
  invites: { max: 20, per: '24 hours' },
  joinRequests: { max: 20, per: '24 hours' },
  announcements: { max: 10, per: 'hour' },
  appeals: { max: APPEALS_PER_WEEK, per: '7 days' },
} as const;

// Enums ------------------------------------------------------------------------------------------------------------

export type ReportSubjectKind = Enums['report_subject'];
export type ReportReason = Enums['report_reason'];
export type StaffRole = 'moderator' | 'admin';
export type CaseStatus = 'open' | 'reviewing' | 'actioned' | 'dismissed';
export type CaseOutcome = 'actioned' | 'dismissed';
export type Severity = 'high' | 'medium' | 'low';
export type HideableKind = 'message' | 'update' | 'challenge_post' | 'challenge_comment' | 'moment';
export const HIDEABLE_KINDS: readonly HideableKind[] = [
  'message',
  'update',
  'challenge_post',
  'challenge_comment',
  'moment',
];
export type AppealKind = 'account_pause' | 'content_hidden' | 'show_up';
export type AppealStatus = 'open' | 'upheld' | 'denied';
export type AppealDecision = 'upheld' | 'denied';
export type ShowUpEffect = 'attended' | 'excused';
export type CorrectionKind = 'show_up_attended' | 'show_up_excused' | 'signal_void';
export type AuditAction =
  | 'grant_staff'
  | 'revoke_staff'
  | 'assign_case'
  | 'resolve_case'
  | 'dismiss_case'
  | 'hide_content'
  | 'restore_content'
  | 'pause_account'
  | 'restore_account'
  | 'decide_appeal'
  | 'void_reputation'
  | 'correct_show_up'
  | 'set_place_sensitive'
  | 'view_queue'
  | 'view_case'
  | 'view_user'
  | 'find_users'
  | 'view_appeals'
  | 'view_appeal'
  | 'view_audit';

// Shapes --------------------------------------------------------------------------------------------------------------

export type PersonBrief = { id: string; display_name: string | null; handle: string | null };
export type StaffBrief = { id: string; display_name: string | null };
export type Page<T> = { items: T[]; next_cursor: string | null };

export type StaffCaseSummary = {
  id: string;
  subject_kind: ReportSubjectKind;
  subject_id: string;
  status: CaseStatus;
  severity: Severity;
  reasons: ReportReason[];
  report_count: number;
  reporter_count: number;
  opened_at: string;
  last_reported_at: string;
  resolved_at: string | null;
  preview: string | null;
  owner: (PersonBrief & { paused: boolean }) | null;
  assigned_to: StaffBrief | null;
  content_hidden: boolean;
};

export type StaffQueue = Page<StaffCaseSummary> & {
  counts: { open: number; reviewing: number; high_open: number };
};

export type StaffSubjectMedia = { bucket: string; path: string; alt_text: string | null };

export type StaffSubject = {
  kind: ReportSubjectKind;
  id: string;
  exists: boolean;
  title: string | null;
  text: string | null;
  media: StaffSubjectMedia[];
  author: PersonBrief | null;
  context: { label: string | null } & Record<string, unknown>;
  created_at: string | null;
  deleted: boolean;
  hidden: boolean;
};

export type AuditEntry = {
  id: number;
  at: string;
  actor: StaffBrief | null;
  action: AuditAction;
  subject_kind: string | null;
  subject_id: string | null;
  target_user: StaffBrief | null;
  case_id: string | null;
  appeal_id: string | null;
  reason: string | null;
  detail: Record<string, unknown>;
};

export type PauseRecord = {
  id: string;
  reason: ReportReason;
  note_to_user: string | null;
  staff_note: string;
  starts_at: string;
  ends_at: string | null;
  case_id: string | null;
  created_by: PersonBrief | null;
  restored_at: string | null;
  restored_by: PersonBrief | null;
  restore_reason: string | null;
  active: boolean;
};

export type AppealSummary = {
  id: string;
  kind: AppealKind;
  status: AppealStatus;
  user: PersonBrief;
  subject_id: string;
  message: string;
  created_at: string;
  decided_at: string | null;
  decided_by: PersonBrief | null;
  decision_note: string | null;
};

export type StaffUserHistory = {
  pauses: PauseRecord[];
  cases_against: {
    total: number;
    actioned: number;
    dismissed: number;
    open: number;
    recent: StaffCaseSummary[];
  };
  reports_made: { total: number; last_30_days: number; dismissed: number };
  hides: {
    id: string;
    subject_kind: HideableKind;
    subject_id: string;
    hidden_at: string;
    reason: string;
    restored_at: string | null;
  }[];
  appeals: AppealSummary[];
  corrections: {
    id: string;
    kind: CorrectionKind;
    activity_id: string | null;
    giver_id: string | null;
    created_at: string;
    reason: string;
  }[];
  blocked_by_count: number;
};

export type StaffProfile = PersonBrief & {
  area: string | null;
  joined_at: string;
  onboarded: boolean;
};

export type StaffUserDetail = StaffUserHistory & {
  profile: StaffProfile;
  staff_role: StaffRole | null;
  paused: PauseRecord | null;
};

export type StaffCaseDetail = {
  case: StaffCaseSummary & {
    resolution: CaseOutcome | null;
    resolution_note: string | null;
    resolved_by: PersonBrief | null;
    assigned_at: string | null;
  };
  subject: StaffSubject;
  snapshot: StaffSubject | null;
  reports: {
    id: string;
    reporter: PersonBrief;
    reason: ReportReason;
    note: string | null;
    created_at: string;
    status: CaseStatus;
  }[];
  related: StaffCaseSummary[];
  owner_history: StaffUserHistory | null;
  hide: { id: string; hidden_at: string; hidden_by: PersonBrief | null; reason: string } | null;
  actions: AuditEntry[];
};

export type StaffFoundUser = PersonBrief & {
  area: string | null;
  paused: boolean;
  staff_role: StaffRole | null;
};

export type StaffAppeals = Page<AppealSummary> & { counts: { open: number } };

export type StaffShowUpGame = {
  activity_id: string;
  sport_id: string;
  starts_at: string;
  status: string;
  place: { name: string; area: string | null } | null;
  host: StaffBrief | null;
  attendance_status: string | null;
  checked_in_count: number;
  confirmed_count: number;
};

export type StaffAppealDetail = {
  appeal: AppealSummary & { correction_effect: ShowUpEffect | null };
  user: StaffProfile & { paused: boolean };
  /** account_pause: { pause }; content_hidden: { hide, content, case }; show_up: the game. */
  subject:
    | { pause: PauseRecord | null }
    | {
        hide: {
          id: string;
          subject_kind: HideableKind;
          subject_id: string;
          hidden_at: string;
          hidden_by: PersonBrief | null;
          reason: string;
          restored_at: string | null;
          case_id: string | null;
        };
        content: StaffSubject;
        case: StaffCaseSummary | null;
      }
    | StaffShowUpGame
    | null;
  actions: AuditEntry[];
};

export type StaffPlace = {
  id: string;
  name: string;
  area: string | null;
  city: string | null;
  sensitive: boolean;
  sport_ids: string[];
};

/** What every staff write returns. */
export type StaffWriteResult = { changed: boolean } & Record<string, unknown>;

// App side -------------------------------------------------------------------------------------------------------------

export type MyAppeal = {
  id: string;
  kind: AppealKind;
  status: AppealStatus;
  subject_id: string;
  message: string;
  created_at: string;
  decided_at: string | null;
  decision_note: string | null;
  correction_effect: ShowUpEffect | null;
};

export type AccountStatus = {
  paused: boolean;
  pause: {
    id: string;
    reason: ReportReason;
    note_to_user: string | null;
    starts_at: string;
    ends_at: string | null;
  } | null;
  appeal: MyAppeal | null;
  can_appeal: boolean;
  hidden_content: {
    hide_id: string;
    subject_kind: HideableKind;
    hidden_at: string;
    reason: string;
    restored_at: string | null;
    appeal_status: AppealStatus | null;
  }[];
};

export type MissedGame = {
  activity_id: string;
  sport_id: string;
  starts_at: string;
  place_name: string | null;
  place_area: string | null;
  appeal_status: AppealStatus | null;
};

// Words --------------------------------------------------------------------------------------------------------------

export const PAUSED_HEADLINE = 'This account is paused';

const DAY_MONTH = new Intl.DateTimeFormat('en-CA', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/** "Until 12 November." / "Until Ojoro restores it." */
export function pausedUntil(endsAt: string | null): string {
  if (!endsAt) return 'Until Ojoro restores it.';
  const d = new Date(endsAt);
  if (Number.isNaN(d.getTime())) return 'Until Ojoro restores it.';
  const parts = DAY_MONTH.formatToParts(d);
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  return `Until ${day} ${month}.`;
}

const REASON_WORDS: Record<ReportReason, string> = {
  spam: 'Spam',
  harassment: 'Harassment',
  unsafe: 'Something unsafe',
  impersonation: 'Pretending to be someone else',
  inappropriate: 'Something inappropriate',
  other: 'Something else',
};

/** Why the account is paused, in words for the person ("Paused for harassment."). */
export function pausedReason(reason: ReportReason): string {
  return `Paused for ${REASON_WORDS[reason].toLowerCase()}.`;
}

export function reportReasonLabel(reason: ReportReason): string {
  return REASON_WORDS[reason];
}

const APPEAL_STATUS_WORDS: Record<AppealStatus, string> = {
  open: 'We are looking at your appeal.',
  upheld: 'We agreed with your appeal.',
  denied: 'We looked again and kept our decision.',
};

export function appealStatusLabel(status: AppealStatus): string {
  return APPEAL_STATUS_WORDS[status];
}

export function severityLabel(severity: Severity): string {
  return severity.toUpperCase();
}

/** Sort key for a queue: high first, then oldest. */
export function compareCases(a: StaffCaseSummary, b: StaffCaseSummary): number {
  const rank: Record<Severity, number> = { high: 3, medium: 2, low: 1 };
  const bySeverity = rank[b.severity] - rank[a.severity];
  if (bySeverity !== 0) return bySeverity;
  return a.opened_at < b.opened_at ? -1 : a.opened_at > b.opened_at ? 1 : 0;
}

/** "3 reports from 2 people." */
export function reportCountLine(reports: number, people: number): string {
  const r = `${reports} ${reports === 1 ? 'report' : 'reports'}`;
  const p = `${people} ${people === 1 ? 'person' : 'people'}`;
  return `${r} from ${p}.`;
}

export function isHideable(kind: string): kind is HideableKind {
  return (HIDEABLE_KINDS as readonly string[]).includes(kind);
}

/** Args for submit_appeal; the key comes from the caller (one per intention). */
export function submitAppealArgs(
  kind: AppealKind,
  subjectId: string,
  message: string,
  idempotencyKey: string,
): { p_kind: AppealKind; p_subject_id: string; p_message: string; p_idempotency_key: string } {
  return {
    p_kind: kind,
    p_subject_id: subjectId,
    p_message: message.trim(),
    p_idempotency_key: idempotencyKey,
  };
}

/** Client-side check before sending an appeal (the server checks again). */
export function appealMessageError(message: string): 'empty' | 'too_long' | null {
  const n = message.trim().length;
  if (n === 0) return 'empty';
  if (n > APPEAL_MESSAGE_MAX) return 'too_long';
  return null;
}
