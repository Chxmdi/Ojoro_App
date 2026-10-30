import { auditWord, detailText } from '../lib/audit';
import { dateTime } from '../lib/format';
import { kindWord } from '../lib/moderation';
import { formatRoute } from '../lib/route';
import type { AuditEntry } from '../lib/types';

export function AuditRows({
  entries,
  compact = false,
}: {
  entries: AuditEntry[];
  compact?: boolean;
}) {
  return (
    <div className="table-wrap">
      <table className="data">
        <caption className="sr-only">Audit entries, newest first</caption>
        <thead>
          <tr className="label-sm">
            <th scope="col">When</th>
            <th scope="col">Who</th>
            <th scope="col">Did</th>
            {compact ? null : <th scope="col">On</th>}
            <th scope="col">Reason</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td className="body-sm num" style={{ whiteSpace: 'nowrap' }}>
                {dateTime(e.at)}
              </td>
              <td className="body-sm">
                {e.actor ? (
                  (e.actor.display_name ?? 'Staff')
                ) : (
                  <span className="muted">System</span>
                )}
              </td>
              <td className="body-sm">
                <span className="title-sm">{auditWord(e.action)}</span>
                {detailText(e.detail) ? (
                  <div className="caption muted">{detailText(e.detail)}</div>
                ) : null}
              </td>
              {compact ? null : (
                <td className="body-sm">
                  {e.case_id ? (
                    <a className="row-link" href={formatRoute({ name: 'report', id: e.case_id })}>
                      {e.subject_kind ? kindWord(e.subject_kind) : 'Case'}
                    </a>
                  ) : e.subject_kind ? (
                    kindWord(e.subject_kind)
                  ) : (
                    <span className="muted">–</span>
                  )}
                  {e.target_user ? (
                    <div className="caption">
                      <a href={formatRoute({ name: 'person', id: e.target_user.id })}>
                        {e.target_user.display_name ?? 'Person'}
                      </a>
                    </div>
                  ) : null}
                </td>
              )}
              <td className="body-sm" style={{ overflowWrap: 'anywhere', maxWidth: 320 }}>
                {e.reason ?? <span className="muted">–</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
