import { useState } from 'react';

import type { Staff } from '../App';
import { api, newKey } from '../api';
import { errorOf, errorWords } from '../lib/errors';
import { ago, count, dateTime } from '../lib/format';
import { caseActions, kindWord, reasonWord, undoFor, undoReason, type CaseAction, type Undo } from '../lib/moderation';
import { formatRoute } from '../lib/route';
import type { StaffCaseDetail } from '../lib/types';
import { ActionDialog, type ActionSpec } from '../ui/ActionDialog';
import { AuditRows } from '../ui/AuditRows';
import { AgeCell, HiddenTag, SeverityTag, StatusTag } from '../ui/CaseBits';
import { useResource } from '../ui/hooks';
import { Empty, Notice, Skeleton, StaleNote, Tag, Toast } from '../ui/kit';
import { SubjectView } from '../ui/Subject';

const ACTION_LABEL: Record<CaseAction, string> = {
  assign_me: 'Take this case',
  unassign: 'Put back in queue',
  hide: 'Hide content',
  restore_content: 'Restore content',
  pause: 'Pause account',
  restore_account: 'Restore account',
  resolve_actioned: 'Resolve: actioned',
  resolve_dismissed: 'Dismiss',
};

type ToastState = { message: string; undo: Undo | null; originalReason: string } | null;

export function ReportDetail({ id, staff, online }: { id: string; staff: Staff; online: boolean }) {
  const res = useResource(`case:${id}`, () => api.caseDetail(id));
  const [spec, setSpec] = useState<ActionSpec | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);

  if (res.data === undefined) {
    if (res.error) {
      const notFound = errorOf(res.error).code === 'case_not_found';
      return (
        <>
          <BackLink />
          <Notice
            kind={notFound ? 'info' : online ? 'error' : 'offline'}
            title={notFound ? "We can't find that case." : online ? "Couldn't load this case." : "You're offline."}
            action={
              notFound ? undefined : (
                <button className="btn btn-small" type="button" onClick={res.reload}>
                  Try again
                </button>
              )
            }
          >
            {errorWords(res.error)}
          </Notice>
        </>
      );
    }
    return (
      <>
        <BackLink />
        <Skeleton rows={10} label="Loading the case" />
      </>
    );
  }

  const d: StaffCaseDetail = res.data;
  const c = d.case;
  const subject = d.subject;
  const actions = caseActions({
    status: c.status,
    subject_kind: c.subject_kind,
    subject_exists: Boolean(subject?.exists),
    content_hidden: Boolean(d.hide) || c.content_hidden,
    hide_id: d.hide?.id ?? null,
    owner: c.owner ? { id: c.owner.id, paused: c.owner.paused } : null,
    assigned_to_me: c.assigned_to?.id === staff.id,
    assigned: Boolean(c.assigned_to),
  });
  const stale = !online || (Boolean(res.error) && Boolean(res.data));
  const topReason = c.reasons[0] ?? 'other';
  const ownerName = c.owner?.display_name ?? 'this person';

  const done = (message: string, action: CaseAction, result: { changed: boolean } & Record<string, unknown>, reason: string, extra: Parameters<typeof undoFor>[1] = { changed: false }) => {
    setToast({
      message: result.changed ? message : 'Already done. Nothing changed.',
      undo: undoFor(action, { ...extra, changed: result.changed }),
      originalReason: reason,
    });
    res.reload();
  };

  async function quick(action: 'assign_me' | 'unassign') {
    setInlineError(null);
    try {
      const key = newKey();
      const r = action === 'assign_me' ? await api.assign(c.id, key) : await api.unassign(c.id, key);
      done(action === 'assign_me' ? 'Case assigned to you.' : 'Case back in the queue.', action, r, '', { changed: r.changed, case_id: c.id });
    } catch (thrown) {
      setInlineError(errorWords(thrown));
    }
  }

  function open(action: CaseAction) {
    const key = newKey(); // one intention per opened dialog; a retry reuses it
    switch (action) {
      case 'assign_me':
      case 'unassign':
        void quick(action);
        return;
      case 'hide':
        return setSpec({
          title: `Hide this ${kindWord(c.subject_kind).toLowerCase()}?`,
          body: 'It reads as deleted for everyone, including in counts and previews. Ojoro keeps the original, and you can restore it.',
          confirmLabel: 'Hide',
          run: async (v) => {
            const r = await api.hide(c.subject_kind, c.subject_id, v.reason, c.id, key);
            done('Hidden.', 'hide', r, v.reason, { changed: r.changed, hide_id: (r.hide_id as string | undefined) ?? null });
          },
        });
      case 'restore_content':
        return setSpec({
          title: 'Restore this content?',
          body: 'It comes back exactly as it was, unless its author deleted it themselves.',
          confirmLabel: 'Restore',
          run: async (v) => {
            const r = await api.restoreContent(d.hide!.id, v.reason, key);
            done('Restored.', 'restore_content', r, v.reason, { changed: r.changed, subject_kind: c.subject_kind, subject_id: c.subject_id, case_id: c.id });
          },
        });
      case 'pause':
        return setSpec({
          title: `Pause ${ownerName}'s account?`,
          body: (
            <>
              They can't use Ojoro while it's paused, and they disappear for everyone else. Nothing is deleted; restoring brings everything back. They can
              appeal. Pausing doesn't close this case.
            </>
          ),
          confirmLabel: 'Pause account',
          pause: { defaultReasonCode: topReason },
          note: { label: 'Note to them (optional)', hint: 'They see this on the paused screen.' },
          run: async (v) => {
            const r = await api.pause(
              { userId: c.owner!.id, reasonCode: v.reasonCode, reason: v.reason, noteToUser: v.note, endsAt: v.endsAt, caseId: c.id },
              key,
            );
            done(v.endsAt ? `Paused until ${dateTime(v.endsAt)}.` : 'Paused until restored.', 'pause', r, v.reason, { changed: r.changed, user_id: c.owner!.id });
          },
        });
      case 'restore_account':
        return setSpec({
          title: `Restore ${ownerName}'s account?`,
          body: 'The pause ends now and everything they had comes back.',
          confirmLabel: 'Restore account',
          run: async (v) => {
            const r = await api.restoreAccount(c.owner!.id, v.reason, key);
            done('Account restored.', 'restore_account', r, v.reason);
          },
        });
      case 'resolve_actioned':
      case 'resolve_dismissed': {
        const outcome = action === 'resolve_actioned' ? 'actioned' : 'dismissed';
        return setSpec({
          title: outcome === 'actioned' ? 'Resolve as actioned?' : 'Dismiss this case?',
          body:
            outcome === 'actioned'
              ? `Closes the case and its ${count(c.report_count, 'report')}. Reporters see it was actioned. A later report opens a new case.`
              : `Closes the case and its ${count(c.report_count, 'report')} with no action. Reporters see it was dismissed. A later report opens a new case.`,
          confirmLabel: outcome === 'actioned' ? 'Resolve' : 'Dismiss',
          final: true,
          run: async (v) => {
            const r = await api.resolve(c.id, outcome, v.reason, key);
            done(outcome === 'actioned' ? 'Case resolved.' : 'Case dismissed.', action, r, v.reason);
          },
        });
      }
    }
  }

  async function runUndo(u: Undo, original: string) {
    setToast(null);
    const reason = undoReason(original || 'assignment');
    try {
      const key = newKey();
      if (u.kind === 'restore_content') await api.restoreContent(u.hide_id, reason, key);
      if (u.kind === 'hide') await api.hide(u.subject_kind, u.subject_id, reason, u.case_id, key);
      if (u.kind === 'restore_account') await api.restoreAccount(u.user_id, reason, key);
      if (u.kind === 'unassign') await api.unassign(u.case_id, key);
      setToast({ message: 'Undone.', undo: null, originalReason: '' });
    } catch (thrown) {
      setInlineError(errorWords(thrown));
    }
    res.reload();
  }

  const showSnapshot =
    d.snapshot && subject && (d.snapshot.text !== subject.text || d.snapshot.title !== subject.title || !subject.exists || subject.deleted);

  return (
    <>
      <BackLink />
      <div className="page-head">
        <div>
          <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
            <StatusTag status={c.status} />
            <SeverityTag severity={c.severity} />
            <AgeCell openedAt={c.opened_at} status={c.status} />
            {c.content_hidden ? <HiddenTag /> : null}
          </div>
          <h1 className="display display-sm">{kindWord(c.subject_kind)} case</h1>
          <p className="body-sm muted num">
            {count(c.report_count, 'report')} from {count(c.reporter_count, 'person', 'people')} · {c.reasons.map(reasonWord).join(', ')} · opened{' '}
            {dateTime(c.opened_at)}
          </p>
        </div>
      </div>
      {stale ? <StaleNote online={online} loadedAt={res.loadedAt} failed={Boolean(res.error)} /> : null}
      {inlineError ? <Notice kind="error" title="That didn't go through.">{inlineError}</Notice> : null}

      <div className="grid-2">
        <div>
          {subject ? <SubjectView subject={subject} heading="Now" /> : <Empty title="The reported thing can't be read now." />}
          {showSnapshot && d.snapshot ? (
            <div style={{ marginTop: 'var(--space-4)' }}>
              <SubjectView subject={d.snapshot} heading="When it was reported" />
            </div>
          ) : null}

          <section className="section" aria-labelledby="h-reports">
            <h2 id="h-reports" className="label">
              Reports <span className="num muted">{d.reports.length}</span>
            </h2>
            <div className="table-wrap">
              <table className="data">
                <caption className="sr-only">Reports on this case, newest first</caption>
                <thead>
                  <tr className="label-sm">
                    <th scope="col">Reporter</th>
                    <th scope="col">Reason</th>
                    <th scope="col">Note</th>
                    <th scope="col">When</th>
                  </tr>
                </thead>
                <tbody>
                  {d.reports.map((r) => (
                    <tr key={r.id}>
                      <td className="body-sm">
                        {r.reporter?.display_name ?? 'Unknown'}
                        {r.reporter?.handle ? <div className="caption muted">@{r.reporter.handle}</div> : null}
                      </td>
                      <td className="body-sm">{reasonWord(r.reason)}</td>
                      <td className="body-sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxWidth: 320 }}>
                        {r.note ?? <span className="muted">No note</span>}
                      </td>
                      <td className="body-sm num">{ago(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="section" aria-labelledby="h-related">
            <h2 id="h-related" className="label">
              Related cases <span className="num muted">{d.related.length}</span>
            </h2>
            {d.related.length === 0 ? (
              <p className="body-sm muted">No other cases on this or against its owner.</p>
            ) : (
              <table className="data">
                <caption className="sr-only">Other cases on the same thing or against the same owner</caption>
                <thead>
                  <tr className="label-sm">
                    <th scope="col">Case</th>
                    <th scope="col">Severity</th>
                    <th scope="col">Status</th>
                    <th scope="col">Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {d.related.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <a className="row-link" href={formatRoute({ name: 'report', id: r.id })}>
                          {kindWord(r.subject_kind)}
                        </a>
                        <div className="body-sm muted">{r.preview ?? r.reasons.map(reasonWord).join(', ')}</div>
                      </td>
                      <td>
                        <SeverityTag severity={r.severity} />
                      </td>
                      <td>
                        <StatusTag status={r.status} />
                      </td>
                      <td className="body-sm num">{dateTime(r.opened_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="section" aria-labelledby="h-history">
            <h2 id="h-history" className="label">
              History
            </h2>
            {d.actions.length === 0 ? <p className="body-sm muted">Nothing done on this case yet.</p> : <AuditRows entries={d.actions} compact />}
          </section>
        </div>

        <aside aria-label="Actions and owner">
          <section className="raised" aria-labelledby="h-actions">
            <h2 id="h-actions" className="label" style={{ marginTop: 0 }}>
              Actions
            </h2>
            {c.status === 'actioned' || c.status === 'dismissed' ? (
              <p className="body-sm">
                {c.status === 'actioned' ? 'Resolved as actioned' : 'Dismissed'}
                {c.resolved_by ? ` by ${c.resolved_by.display_name ?? 'staff'}` : ''} {c.resolved_at ? ago(c.resolved_at) : ''}.
                {c.resolution_note ? <span className="muted"> “{c.resolution_note}”</span> : null}
              </p>
            ) : c.assigned_to ? (
              <p className="body-sm">Assigned to {c.assigned_to.id === staff.id ? 'you' : (c.assigned_to.display_name ?? 'staff')}.</p>
            ) : (
              <p className="body-sm">Nobody is on this case.</p>
            )}
            {d.hide ? (
              <p className="body-sm">
                Hidden {ago(d.hide.hidden_at)}
                {d.hide.reason ? <span className="muted"> “{d.hide.reason}”</span> : null}
              </p>
            ) : null}
            <div className="action-list" style={{ marginTop: 'var(--space-4)' }}>
              {actions.map((a) => (
                <button
                  key={a}
                  type="button"
                  className={`btn${a === 'resolve_actioned' ? ' btn-primary' : ''}`}
                  disabled={stale}
                  onClick={() => open(a)}
                >
                  {ACTION_LABEL[a]}
                </button>
              ))}
              {actions.length === 0 ? <p className="body-sm muted">No actions left on this case.</p> : null}
            </div>
          </section>

          <section className="section" aria-labelledby="h-owner">
            <h2 id="h-owner" className="label">
              Owner
            </h2>
            {c.owner ? (
              <>
                <p className="title-sm">
                  {c.owner.display_name ?? 'No name'} {c.owner.paused ? <Tag tone="strong">Paused</Tag> : null}
                </p>
                {c.owner.handle ? <p className="caption muted">@{c.owner.handle}</p> : null}
                {d.owner_history ? <OwnerHistory h={d.owner_history} /> : null}
              </>
            ) : (
              <p className="body-sm muted">Nobody owns this (a place or an Ojoro post).</p>
            )}
          </section>
        </aside>
      </div>

      <ActionDialog spec={spec} onClose={() => setSpec(null)} online={online} />
      {toast ? (
        <Toast
          message={toast.message}
          {...(toast.undo ? { action: { label: 'Undo', onPress: () => void runUndo(toast.undo!, toast.originalReason) } } : {})}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </>
  );
}

function OwnerHistory({ h }: { h: NonNullable<StaffCaseDetail['owner_history']> }) {
  const active = h.pauses.find((p) => p.active);
  return (
    <dl className="facts body-sm num" style={{ marginTop: 'var(--space-4)' }}>
      <dt>Cases against</dt>
      <dd>
        {h.cases_against.total} ({h.cases_against.actioned} actioned, {h.cases_against.dismissed} dismissed, {h.cases_against.open} open)
      </dd>
      <dt>Reports made</dt>
      <dd>
        {h.reports_made.total} ({h.reports_made.last_30_days} in 30 days, {h.reports_made.dismissed} dismissed)
      </dd>
      <dt>Pauses</dt>
      <dd>
        {h.pauses.length}
        {active ? ` (paused now${active.ends_at ? `, until ${dateTime(active.ends_at)}` : ', until restored'})` : ''}
      </dd>
      <dt>Hidden content</dt>
      <dd>{h.hides.length}</dd>
      <dt>Appeals</dt>
      <dd>{h.appeals.length}</dd>
      <dt>Blocked by</dt>
      <dd>{count(h.blocked_by_count, 'person', 'people')}</dd>
    </dl>
  );
}

function BackLink() {
  return (
    <p style={{ margin: '0 0 var(--space-4)' }}>
      <a className="btn btn-ghost btn-small" href="#/queue" style={{ paddingLeft: 0 }}>
        Back to the queue
      </a>
    </p>
  );
}
