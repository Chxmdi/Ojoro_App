/**
 * The jsonb shapes the staff RPCs return come from the contract (packages/contracts/src/trust.ts,
 * docs/TRUST_CONTRACT.md). Re-exported here under the names the screens use.
 */
export type {
  AppealSummary,
  AuditEntry,
  Page,
  StaffAppealDetail,
  StaffAppeals as AppealsPage,
  StaffCaseDetail,
  StaffCaseSummary,
  StaffPlace,
  StaffQueue as QueuePage,
  StaffShowUpGame,
  StaffSubject,
  StaffUserHistory,
  StaffWriteResult as WriteResult,
} from '@ojoro/contracts';
