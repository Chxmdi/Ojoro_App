import { useState } from 'react';

import { api, newKey } from '../api';
import { errorOf, errorWords } from '../lib/errors';
import { ago, dateTime, humanize, shortAge } from '../lib/format';
import { APPEAL_KINDS, kindWord, reasonWord } from '../lib/moderation';
import { formatRoute, withParams, type Route } from '../lib/route';
import type { StaffAppealDetail, StaffShowUpGame } from '../lib/types';
import { ActionDialog, type ActionSpec } from '../ui/ActionDialog';
import { AuditRows } from '../ui/AuditRows';
import { StatusTag } from '../ui/CaseBits';
import { Filter } from '../ui/Filter';
import { useResource } from '../ui/hooks';
import { Empty, Notice, Pager, Skeleton, StaleNote, Toast } from '../ui/kit';
import { SubjectView } from '../ui/Subject';
import { useCursorPaging } from '../ui/useCursorPaging';

type AppealsRoute = Extract<Route, { name: 'appeals' }>;

export function Appeals({ route, go, online }: { route: AppealsRoute; go: (r: Route) => void; online: boolean }) {
  if (route.params.id) return <AppealDetail id={route.params.id} back={withParams(route, { id: undefined })} online={online} />;
  return <AppealList route={route} go={go} online={online} />;
}

function AppealList({ route, go, online }: { route: AppealsRoute; go: (r: Route) => void; online: boolean }) {
  const status = route.params.status && ['open', 'upheld', 'denied'].includes(route.params.status) ? [route.params.status] : ['open'];
  const kinds = route.params.kind && (APPEAL_KINDS as readonly string[]).includes(route.params.kind) ? [route.params.kind] : null;
  const key = JSON.stringify([status, kinds]);
  const paging = useCursorPaging(key);
  const res = useResource(`${key}|${paging.cursor ?? ''}`, () => api.appeals(status, kinds, paging.cursor));

  return (
    <>
      <div className="page-head">
        <div>
          <p className="label muted">Moderation</p>
          <h1 className="display display-sm">Appeals</h1>
        </div>
        {res.data?.counts ? <p className="body-sm num">{res.data.counts.open} open</p> : null}
      </div>
      <div className="filters" role="group" aria-label="Filter appeals">
        <Filter
          id="f-astatus"
          label="Status"
          value={status[0]!}
          onChange={(v) => go(withParams(route, { status: v === 'open' ? undefined : v }))}
          options={[
            { value: 'open', label: 'Open' },
            { value: 'upheld', label: 'Upheld' },
            { value: 'denied', label: 'Denied' },
          ]}
        />
        <Filter
          id="f-akind"
          label="About"
          value={kinds?.[0] ?? ''}
          onChange={(v) => go(withParams(route, { kind: v }))}
          options={[{ value: '', label: 'Anything' }, ...APPEAL_KINDS.map((k) => ({ value: k, label: kindWord(k) }))]}
        />
      </div>
      <StaleNote online={online} loadedAt={res.loadedAt} failed={Boolean(res.error) && Boolean(res.data)} />
      {res.data === undefined ? (
        res.error ? (
          <Notice
            kind={online ? 'error' : 'offline'}
            title={online ? "Couldn't load appeals." : "You're offline."}
            action={
              <button className="btn btn-small" type="button" onClick={res.reload}>
                Try again
              </button>
            }
          >
            {errorWords(res.error)}
          </Notice>
        ) : (
          <Skeleton label="Loading appeals" />
        )
      ) : res.data.items.length === 0 ? (
        <Empty title={status[0] === 'open' ? 'No open appeals.' : 'No appeals here.'}>People appeal pauses, hidden content and missed games from the app.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <caption className="sr-only">Appeals{status[0] === 'open' ? ', oldest first' : ', newest decided first'}</caption>
            <thead>
              <tr className="label-sm">
                <th scope="col">About</th>
                <th scope="col">Person</th>
                <th scope="col">What they said</th>
                <th scope="col">Age</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {res.data.items.map((a) => (
                <tr key={a.id}>
                  <td>
                    <a className="row-link" href={formatRoute(withParams(route, { id: a.id }))}>
                      {kindWord(a.kind)}
                    </a>
                  </td>
                  <td className="body-sm">
                    {a.user?.display_name ?? 'Unknown'}
                    {a.user?.handle ? <div className="caption muted">@{a.user.handle}</div> : null}
                  </td>
                  <td className="body-sm" style={{ maxWidth: 420, overflowWrap: 'anywhere' }}>
                    {a.message ?? ''}
                  </td>
                  <td className="body-sm num">{shortAge(a.created_at)}</td>
                  <td>
                    <StatusTag status={a.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager
            label="Appeals"
            page={paging.page}
            hasNext={Boolean(res.data.next_cursor)}
            onPage={(p) => (p > paging.page ? paging.next(res.data?.next_cursor ?? null) : paging.prev())}
          />
        </div>
      )}
    </>
  );
}

type Subject = StaffAppealDetail['subject'];

function AppealSubject({ kind, subject }: { kind: string; subject: Subject }) {
  if (!subject) return <p className="body-sm muted">The thing this appeal is about can't be read now.</p>;
  if (kind === 'account_pause' && 'pause' in subject) {
    const p = subject.pause;
    if (!p) return <p className="body-sm muted">That pause can't be read now.</p>;
    return (
      <dl className="facts body-sm">
        <dt>Category</dt>
        <dd>{reasonWord(p.reason)}</dd>
        <dt>Started</dt>
        <dd className="num">{dateTime(p.starts_at)}</dd>
        <dt>Ends</dt>
        <dd className="num">{p.ends_at ? dateTime(p.ends_at) : 'When staff restore it'}</dd>
        <dt>Paused by</dt>
        <dd>{p.created_by?.display_name ?? 'Staff'}</dd>
        <dt>Staff reason</dt>
        <dd>{p.staff_note || '–'}</dd>
        <dt>Note to them</dt>
        <dd>{p.note_to_user ?? '–'}</dd>
        <dt>Now</dt>
        <dd>{p.active ? 'Paused' : p.restored_at ? `Restored ${ago(p.restored_at)}` : 'Ended'}</dd>
      </dl>
    );
  }
  if (kind === 'content_hidden' && 'hide' in subject) {
    const caseId = subject.case?.id ?? subject.hide.case_id;
    return (
      <div className="stack">
        <dl className="facts body-sm">
          <dt>Hidden</dt>
          <dd className="num">{dateTime(subject.hide.hidden_at)}</dd>
          <dt>Hidden by</dt>
          <dd>{subject.hide.hidden_by?.display_name ?? 'Staff'}</dd>
          <dt>Why</dt>
          <dd>{subject.hide.reason}</dd>
          <dt>Now</dt>
          <dd>{subject.hide.restored_at ? `Restored ${ago(subject.hide.restored_at)}` : 'Hidden'}</dd>
          {caseId ? (
            <>
              <dt>Case</dt>
              <dd>
                <a className="row-link" href={formatRoute({ name: 'report', id: caseId })}>
                  Open the case
                </a>
              </dd>
            </>
          ) : null}
        </dl>
        <SubjectView subject={subject.content} heading="The hidden content (the kept original)" />
      </div>
    );
  }
  if ('activity_id' in subject) {
    const g: StaffShowUpGame = subject;
    return (
      <dl className="facts body-sm num">
        <dt>Game</dt>
        <dd>
          {humanize(g.sport_id)} · {dateTime(g.starts_at)}
        </dd>
        <dt>Place</dt>
        <dd>{g.place ? [g.place.name, g.place.area].filter(Boolean).join(', ') : '–'}</dd>
        <dt>Host</dt>
        <dd>{g.host?.display_name ?? '–'}</dd>
        <dt>Their attendance</dt>
        <dd>{humanize(g.attendance_status)}</dd>
        <dt>Checked in</dt>
        <dd>{g.checked_in_count}</dd>
        <dt>Confirmed</dt>
        <dd>{g.confirmed_count}</dd>
      </dl>
    );
  }
  return <p className="body-sm muted">The thing this appeal is about can't be read now.</p>;
}

function AppealDetail({ id, back, online }: { id: string; back: Route; online: boolean }) {
  const res = useResource(`appeal:${id}`, () => api.appeal(id));
  const [spec, setSpec] = useState<ActionSpec | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const backLink = (
    <p style={{ margin: '0 0 var(--space-4)' }}>
      <a className="btn btn-ghost btn-small" href={formatRoute(back)} style={{ paddingLeft: 0 }}>
        Back to appeals
      </a>
    </p>
  );
  if (res.data === undefined) {
    return (
      <>
        {backLink}
        {res.error ? (
          <Notice
            kind={errorOf(res.error).code === 'appeal_not_found' ? 'info' : online ? 'error' : 'offline'}
            title={online ? "Couldn't load this appeal." : "You're offline."}
            action={
              <button className="btn btn-small" type="button" onClick={res.reload}>
                Try again
              </button>
            }
          >
            {errorWords(res.error)}
          </Notice>
        ) : (
          <Skeleton rows={8} label="Loading the appeal" />
        )}
      </>
    );
  }
  const { appeal, user, subject, actions } = res.data;
  const stale = !online || Boolean(res.error);
  const decide = (decision: 'upheld' | 'denied') => {
    const key = newKey();
    const fix =
      appeal.kind === 'account_pause'
        ? 'The account is restored now.'
        : appeal.kind === 'content_hidden'
          ? 'The content is restored now.'
          : 'Their show-up record is corrected.';
    setSpec({
      title: decision === 'upheld' ? 'Uphold this appeal?' : 'Deny this appeal?',
      body: decision === 'upheld' ? `${fix} They see your note.` : 'Nothing changes. They see your note.',
      confirmLabel: decision === 'upheld' ? 'Uphold' : 'Deny',
      final: true,
      note: { label: 'Note to them (optional)', hint: 'Shown with the decision in the app.' },
      ...(decision === 'upheld' && appeal.kind === 'show_up'
        ? {
            effect: {
              label: 'Correct the game to',
              options: [
                { value: 'attended', label: 'Showed up (counts as attended)' },
                { value: 'excused', label: "Excused (doesn't count either way)" },
              ],
            },
          }
        : {}),
      run: async (v) => {
        const r = await api.decideAppeal({ appealId: appeal.id, decision, reason: v.reason, noteToUser: v.note, effect: v.effect }, key);
        setToast(r.changed ? (decision === 'upheld' ? 'Appeal upheld.' : 'Appeal denied.') : 'Already decided. Nothing changed.');
        res.reload();
      },
    });
  };

  return (
    <>
      {backLink}
      <div className="page-head">
        <div>
          <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
            <StatusTag status={appeal.status} />
            <span className="body-sm muted num">sent {ago(appeal.created_at)}</span>
          </div>
          <h1 className="display display-sm">{kindWord(appeal.kind)} appeal</h1>
          <p className="body-sm muted">
            From {user?.display_name ?? 'Unknown'}
            {user?.handle ? ` (@${user.handle})` : ''}
            {user?.area ? ` · ${user.area}` : ''}
          </p>
        </div>
      </div>
      {stale ? <StaleNote online={online} loadedAt={res.loadedAt} failed={Boolean(res.error)} /> : null}
      <div className="grid-2">
        <div>
          <section className="subject" aria-labelledby="h-msg">
            <h2 id="h-msg" className="label-sm muted" style={{ margin: 0 }}>
              What they said
            </h2>
            <blockquote className="body-sm">{appeal.message}</blockquote>
          </section>
          <section className="section" aria-labelledby="h-about">
            <h2 id="h-about" className="label">
              What it's about
            </h2>
            <AppealSubject kind={appeal.kind} subject={subject} />
          </section>
          <section className="section" aria-labelledby="h-ahistory">
            <h2 id="h-ahistory" className="label">
              History
            </h2>
            {actions.length ? <AuditRows entries={actions} compact /> : <p className="body-sm muted">Nothing done yet.</p>}
          </section>
        </div>
        <aside className="raised" aria-labelledby="h-decide" style={{ alignSelf: 'start' }}>
          <h2 id="h-decide" className="label" style={{ marginTop: 0 }}>
            Decision
          </h2>
          {appeal.status === 'open' ? (
            <div className="action-list">
              <button type="button" className="btn btn-primary" disabled={stale} onClick={() => decide('upheld')}>
                Uphold
              </button>
              <button type="button" className="btn" disabled={stale} onClick={() => decide('denied')}>
                Deny
              </button>
            </div>
          ) : (
            <p className="body-sm">
              {appeal.status === 'upheld' ? 'Upheld' : 'Denied'} {appeal.decided_at ? ago(appeal.decided_at) : ''}.
              {appeal.decision_note ? <span className="muted"> Note to them: “{appeal.decision_note}”</span> : null}
              {appeal.correction_effect ? <span className="muted"> Correction: {appeal.correction_effect}.</span> : null}
            </p>
          )}
        </aside>
      </div>
      <ActionDialog spec={spec} onClose={() => setSpec(null)} online={online} />
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
