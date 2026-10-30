import { useState, type FormEvent } from 'react';

import type { Staff } from '../App';
import { api } from '../api';
import { errorOf, errorWords } from '../lib/errors';
import { ago, count, dateTime } from '../lib/format';
import {
  kindWord,
  reasonWord,
  undoFor,
  undoReason,
  validateSearch,
  type Undo,
} from '../lib/moderation';
import { formatRoute, withParams, type Route } from '../lib/route';
import type { WriteResult } from '../lib/types';
import { ActionDialog, type ActionSpec } from '../ui/ActionDialog';
import { pauseSpec, restoreSpec } from '../ui/accountSpecs';
import { AuditRows } from '../ui/AuditRows';
import { SeverityTag, StatusTag } from '../ui/CaseBits';
import { Icon } from '../ui/Icon';
import { useResource } from '../ui/hooks';
import { Empty, Notice, Skeleton, StaleNote, Tag, Toast } from '../ui/kit';
import { FieldError } from './SignIn';

type PeopleRoute = Extract<Route, { name: 'people' }>;

/** Find people by name or handle (never by phone: the contract doesn't allow it). */
export function People({
  route,
  go,
  online,
}: {
  route: PeopleRoute;
  go: (r: Route) => void;
  online: boolean;
}) {
  const q = route.params.q ?? '';
  const [draft, setDraft] = useState(q);
  const [error, setError] = useState<string | null>(null);
  const search = (e: FormEvent) => {
    e.preventDefault();
    const problem = validateSearch(draft);
    setError(problem);
    if (!problem) go(withParams(route, { q: draft.trim() }));
  };

  return (
    <>
      <div className="page-head">
        <div>
          <p className="label muted">Moderation</p>
          <h1 className="display display-sm">People</h1>
        </div>
        <p className="body-sm muted" style={{ maxWidth: 420 }}>
          Search by name or handle. Every search and every person you open is in the audit log.
        </p>
      </div>
      <div className="filters">
        <form
          className="row"
          onSubmit={search}
          role="search"
          style={{ alignItems: 'flex-end' }}
          noValidate
        >
          <div className="field">
            <label className="label-sm" htmlFor="people-q">
              Name or handle
            </label>
            <input
              id="people-q"
              className="input"
              type="search"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'people-q-err' : undefined}
            />
          </div>
          <button type="submit" className="btn">
            <Icon name="search" size={16} /> Search
          </button>
        </form>
      </div>
      {error ? <FieldError id="people-q-err" text={error} /> : null}
      {q ? (
        <Results q={q} online={online} />
      ) : (
        <Empty title="Search for someone.">At least 2 characters of their name or handle.</Empty>
      )}
    </>
  );
}

function Results({ q, online }: { q: string; online: boolean }) {
  const res = useResource(`people:${q}`, () => api.findUsers(q));
  if (res.data === undefined) {
    return res.error ? (
      <Notice
        kind={online ? 'error' : 'offline'}
        title={online ? "Couldn't search." : "You're offline."}
        action={
          <button className="btn btn-small" type="button" onClick={res.reload}>
            Try again
          </button>
        }
      >
        {errorWords(res.error)}
      </Notice>
    ) : (
      <Skeleton label="Searching" />
    );
  }
  if (res.data.items.length === 0)
    return <Empty title="Nobody found.">{`No name or handle matches “${q}”.`}</Empty>;
  return (
    <>
      <StaleNote online={online} loadedAt={res.loadedAt} failed={Boolean(res.error)} />
      <div className="table-wrap">
        <table className="data">
          <caption className="sr-only">
            {count(res.data.items.length, 'person', 'people')} found
          </caption>
          <thead>
            <tr className="label-sm">
              <th scope="col">Person</th>
              <th scope="col">Area</th>
              <th scope="col">Account</th>
            </tr>
          </thead>
          <tbody>
            {res.data.items.map((p) => (
              <tr key={p.id}>
                <td>
                  <a className="row-link" href={formatRoute({ name: 'person', id: p.id })}>
                    {p.display_name ?? 'No name'}
                  </a>
                  {p.handle ? <div className="caption muted">@{p.handle}</div> : null}
                </td>
                <td className="body-sm">{p.area ?? '–'}</td>
                <td>
                  <span className="row" style={{ gap: 'var(--space-2)' }}>
                    {p.paused ? (
                      <Tag tone="strong">Paused</Tag>
                    ) : (
                      <span className="body-sm muted">Active</span>
                    )}
                    {p.staff_role ? (
                      <Tag>{p.staff_role === 'admin' ? 'Admin' : 'Moderator'}</Tag>
                    ) : null}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function Person({ id, online }: { id: string; staff: Staff; online: boolean }) {
  const res = useResource(`person:${id}`, () => api.user(id));
  const history = useResource(`person-audit:${id}`, () =>
    api.audit({ p_actions: null, p_case_id: null, p_target_user: id, p_actor: null }, null),
  );
  const [spec, setSpec] = useState<ActionSpec | null>(null);
  const [toast, setToast] = useState<{ message: string; undo: Undo | null; reason: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const back = (
    <p style={{ margin: '0 0 var(--space-4)' }}>
      <a className="btn btn-ghost btn-small" href="#/people" style={{ paddingLeft: 0 }}>
        Back to people
      </a>
    </p>
  );
  if (res.data === undefined) {
    return (
      <>
        {back}
        {res.error ? (
          <Notice
            kind={
              errorOf(res.error).code === 'user_not_found' ? 'info' : online ? 'error' : 'offline'
            }
            title={
              errorOf(res.error).code === 'user_not_found'
                ? "We can't find that person."
                : online
                  ? "Couldn't load this person."
                  : "You're offline."
            }
            action={
              <button className="btn btn-small" type="button" onClick={res.reload}>
                Try again
              </button>
            }
          >
            {errorWords(res.error)}
          </Notice>
        ) : (
          <Skeleton rows={8} label="Loading the person" />
        )}
      </>
    );
  }

  const u = res.data;
  const name = u.profile.display_name ?? 'this person';
  const stale = !online || Boolean(res.error);
  const reload = () => {
    res.reload();
    history.reload();
  };
  const onDone =
    (action: 'pause' | 'restore_account') => (message: string, r: WriteResult, reason: string) => {
      setToast({
        message: r.changed ? message : 'Already so. Nothing changed.',
        undo: undoFor(action, { changed: r.changed, user_id: id }),
        reason,
      });
      reload();
    };
  const undo = async (un: Undo, reason: string) => {
    setToast(null);
    if (un.kind !== 'restore_account') return;
    try {
      await api.restoreAccount(un.user_id, undoReason(reason), crypto.randomUUID());
      setToast({ message: 'Undone.', undo: null, reason: '' });
    } catch (thrown) {
      setError(errorWords(thrown));
    }
    reload();
  };

  return (
    <>
      {back}
      <div className="page-head">
        <div>
          <div className="row" style={{ marginBottom: 'var(--space-2)' }}>
            {u.paused ? (
              <Tag tone="strong" icon="clock">
                Paused {u.paused.ends_at ? `until ${dateTime(u.paused.ends_at)}` : 'until restored'}
              </Tag>
            ) : (
              <Tag icon="check">Active</Tag>
            )}
            {u.staff_role ? <Tag>{u.staff_role === 'admin' ? 'Admin' : 'Moderator'}</Tag> : null}
          </div>
          <h1 className="display display-sm">{name}</h1>
          <p className="body-sm muted">
            {u.profile.handle ? `@${u.profile.handle} · ` : ''}
            {u.profile.area ?? 'No area'} · joined {dateTime(u.profile.joined_at)}
            {u.profile.onboarded ? '' : ' · not onboarded'}
          </p>
        </div>
      </div>
      {stale ? (
        <StaleNote online={online} loadedAt={res.loadedAt} failed={Boolean(res.error)} />
      ) : null}
      {error ? (
        <Notice kind="error" title="That didn't go through.">
          {error}
        </Notice>
      ) : null}

      <div className="grid-2">
        <div>
          <section aria-labelledby="h-cases">
            <h2 id="h-cases" className="label" style={{ marginTop: 0 }}>
              Cases against them{' '}
              <span className="num muted">
                {u.cases_against.total} ({u.cases_against.open} open, {u.cases_against.actioned}{' '}
                actioned, {u.cases_against.dismissed} dismissed)
              </span>
            </h2>
            {u.cases_against.recent.length === 0 ? (
              <p className="body-sm muted">No cases against them.</p>
            ) : (
              <table className="data">
                <caption className="sr-only">Recent cases against this person</caption>
                <thead>
                  <tr className="label-sm">
                    <th scope="col">Case</th>
                    <th scope="col">Severity</th>
                    <th scope="col">Status</th>
                    <th scope="col">Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {u.cases_against.recent.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <a className="row-link" href={formatRoute({ name: 'report', id: c.id })}>
                          {kindWord(c.subject_kind)}
                        </a>
                        <div className="body-sm muted" style={{ overflowWrap: 'anywhere' }}>
                          {c.preview ?? c.reasons.map(reasonWord).join(', ')}
                        </div>
                      </td>
                      <td>
                        <SeverityTag severity={c.severity} />
                      </td>
                      <td>
                        <StatusTag status={c.status} />
                      </td>
                      <td className="body-sm num">{dateTime(c.opened_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="section" aria-labelledby="h-pauses">
            <h2 id="h-pauses" className="label">
              Pauses <span className="num muted">{u.pauses.length}</span>
            </h2>
            {u.pauses.length === 0 ? (
              <p className="body-sm muted">Never paused.</p>
            ) : (
              <table className="data">
                <caption className="sr-only">Pauses, newest first</caption>
                <thead>
                  <tr className="label-sm">
                    <th scope="col">From</th>
                    <th scope="col">Until</th>
                    <th scope="col">Category</th>
                    <th scope="col">Reason</th>
                    <th scope="col">Now</th>
                  </tr>
                </thead>
                <tbody>
                  {u.pauses.map((p) => (
                    <tr key={p.id}>
                      <td className="body-sm num">{dateTime(p.starts_at)}</td>
                      <td className="body-sm num">
                        {p.ends_at ? dateTime(p.ends_at) : 'Until restored'}
                      </td>
                      <td className="body-sm">{reasonWord(p.reason)}</td>
                      <td className="body-sm" style={{ overflowWrap: 'anywhere' }}>
                        {p.staff_note}
                      </td>
                      <td className="body-sm">
                        {p.active ? (
                          <Tag tone="strong">Paused</Tag>
                        ) : p.restored_at ? (
                          <>
                            Restored {ago(p.restored_at)}
                            {p.restore_reason ? (
                              <div className="caption muted">{p.restore_reason}</div>
                            ) : null}
                          </>
                        ) : (
                          'Ended'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="section" aria-labelledby="h-hides">
            <h2 id="h-hides" className="label">
              Hidden content <span className="num muted">{u.hides.length}</span>
            </h2>
            {u.hides.length === 0 ? (
              <p className="body-sm muted">Nothing of theirs hidden.</p>
            ) : (
              <ul className="timeline body-sm">
                {u.hides.map((h) => (
                  <li key={h.id}>
                    {kindWord(h.subject_kind)} hidden {dateTime(h.hidden_at)}: {h.reason}
                    {h.restored_at ? (
                      <span className="muted"> · restored {ago(h.restored_at)}</span>
                    ) : (
                      <span> · still hidden</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="section" aria-labelledby="h-pappeals">
            <h2 id="h-pappeals" className="label">
              Appeals <span className="num muted">{u.appeals.length}</span>
            </h2>
            {u.appeals.length === 0 ? (
              <p className="body-sm muted">No appeals.</p>
            ) : (
              <ul className="timeline body-sm">
                {u.appeals.map((a) => (
                  <li key={a.id} className="row" style={{ justifyContent: 'space-between' }}>
                    <span>
                      <a
                        className="row-link"
                        href={formatRoute({ name: 'appeals', params: { id: a.id } })}
                      >
                        {kindWord(a.kind)}
                      </a>{' '}
                      <span className="muted">{ago(a.created_at)}</span>
                    </span>
                    <StatusTag status={a.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {u.corrections.length ? (
            <section className="section" aria-labelledby="h-corr">
              <h2 id="h-corr" className="label">
                Reputation corrections <span className="num muted">{u.corrections.length}</span>
              </h2>
              <ul className="timeline body-sm">
                {u.corrections.map((c) => (
                  <li key={c.id}>
                    {humanizeCorrection(c.kind)} · {dateTime(c.created_at)}: {c.reason}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="section" aria-labelledby="h-phistory">
            <h2 id="h-phistory" className="label">
              History
            </h2>
            {history.data === undefined ? (
              history.error ? (
                <p className="body-sm">{errorWords(history.error)}</p>
              ) : (
                <Skeleton rows={3} label="Loading history" />
              )
            ) : history.data.items.length === 0 ? (
              <p className="body-sm muted">No staff actions on this person yet.</p>
            ) : (
              <>
                <AuditRows
                  entries={history.data.items
                    .filter((e) => !e.action.startsWith('view_'))
                    .slice(0, 20)}
                  compact
                />
                <p className="body-sm">
                  <a href={formatRoute({ name: 'audit', params: { user: id, action: 'all' } })}>
                    Everything about them in the audit log
                  </a>
                </p>
              </>
            )}
          </section>
        </div>

        <aside aria-label="Actions and record">
          <section className="raised" aria-labelledby="h-pactions">
            <h2 id="h-pactions" className="label" style={{ marginTop: 0 }}>
              Actions
            </h2>
            {u.paused ? (
              <p className="body-sm">
                Paused {ago(u.paused.starts_at)}. Category: {reasonWord(u.paused.reason)}.
                {u.paused.note_to_user ? (
                  <span className="muted"> Note to them: “{u.paused.note_to_user}”</span>
                ) : null}
              </p>
            ) : null}
            <div className="action-list" style={{ marginTop: 'var(--space-4)' }}>
              {u.paused ? (
                <button
                  type="button"
                  className="btn"
                  disabled={stale}
                  onClick={() =>
                    setSpec(restoreSpec({ name, userId: id, onDone: onDone('restore_account') }))
                  }
                >
                  Restore account
                </button>
              ) : u.staff_role ? (
                <p className="body-sm muted">
                  Staff accounts can't be paused. Revoke the staff role first.
                </p>
              ) : (
                <button
                  type="button"
                  className="btn"
                  disabled={stale}
                  onClick={() =>
                    setSpec(
                      pauseSpec({
                        name,
                        userId: id,
                        caseId: null,
                        defaultReasonCode: 'other',
                        onDone: onDone('pause'),
                      }),
                    )
                  }
                >
                  Pause account
                </button>
              )}
            </div>
          </section>
          <section className="section" aria-labelledby="h-record">
            <h2 id="h-record" className="label">
              Record
            </h2>
            <dl className="facts body-sm num">
              <dt>Reports they made</dt>
              <dd>
                {u.reports_made.total} ({u.reports_made.last_30_days} in 30 days,{' '}
                {u.reports_made.dismissed} dismissed)
              </dd>
              <dt>Blocked by</dt>
              <dd>{count(u.blocked_by_count, 'person', 'people')}</dd>
            </dl>
          </section>
        </aside>
      </div>
      <ActionDialog spec={spec} onClose={() => setSpec(null)} online={online} />
      {toast ? (
        <Toast
          message={toast.message}
          {...(toast.undo
            ? { action: { label: 'Undo', onPress: () => void undo(toast.undo!, toast.reason) } }
            : {})}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </>
  );
}

function humanizeCorrection(kind: string): string {
  return kind === 'show_up_attended'
    ? 'Game counted as showed up'
    : kind === 'show_up_excused'
      ? 'Game excused'
      : kind === 'signal_void'
        ? 'Signals voided'
        : kind;
}
