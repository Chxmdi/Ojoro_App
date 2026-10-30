import { useState } from 'react';

import { api } from '../api';
import { errorWords } from '../lib/errors';
import { count } from '../lib/format';
import { currentCursor, kindWord, nextStack, prevStack, queueFilters, reasonWord, SUBJECT_KINDS, type CursorStack } from '../lib/moderation';
import { formatRoute, withParams, type Route } from '../lib/route';
import { AgeCell, HiddenTag, SeverityTag, StatusTag } from '../ui/CaseBits';
import { Filter } from '../ui/Filter';
import { useResource } from '../ui/hooks';
import { Empty, Notice, Pager, Skeleton, StaleNote, Tag } from '../ui/kit';

type ListRoute = Extract<Route, { name: 'queue' }>;

export function Queue({ route, go, online }: { route: ListRoute; go: (r: Route) => void; online: boolean }) {
  const filters = queueFilters(route.params);
  const filterKey = JSON.stringify(filters);
  const [paging, setPaging] = useState<{ key: string; stack: CursorStack }>({ key: filterKey, stack: [null] });
  const stack = paging.key === filterKey ? paging.stack : [null];
  const cursor = currentCursor(stack);
  const res = useResource(`${filterKey}|${cursor ?? ''}`, () => api.queue(filters, cursor));
  const set = (k: string, v: string) => go(withParams(route, { [k]: v }));
  const counts = res.data?.counts;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="label muted">Moderation</p>
          <h1 className="display display-sm">Queue</h1>
        </div>
        {counts ? (
          <p className="body-sm num" aria-label="Queue totals">
            {count(counts.open, 'open case')} · {counts.reviewing} reviewing · {counts.high_open} high severity open
          </p>
        ) : null}
      </div>

      <div className="filters" role="group" aria-label="Filter the queue">
        <Filter
          id="f-status"
          label="Status"
          value={route.params.status ?? ''}
          onChange={(v) => set('status', v)}
          options={[
            { value: '', label: 'Open and reviewing' },
            { value: 'open', label: 'Open' },
            { value: 'reviewing', label: 'Reviewing' },
            { value: 'actioned', label: 'Actioned' },
            { value: 'dismissed', label: 'Dismissed' },
            { value: 'actioned,dismissed', label: 'Resolved' },
          ]}
        />
        <Filter
          id="f-severity"
          label="Severity"
          value={route.params.severity ?? ''}
          onChange={(v) => set('severity', v)}
          options={[
            { value: '', label: 'Any' },
            { value: 'high', label: 'High' },
            { value: 'medium', label: 'Medium' },
            { value: 'low', label: 'Low' },
          ]}
        />
        <Filter
          id="f-kind"
          label="What"
          value={route.params.kind ?? ''}
          onChange={(v) => set('kind', v)}
          options={[{ value: '', label: 'Anything' }, ...SUBJECT_KINDS.map((k) => ({ value: k, label: kindWord(k) }))]}
        />
        <Filter
          id="f-assigned"
          label="Assigned"
          value={route.params.assigned ?? ''}
          onChange={(v) => set('assigned', v)}
          options={[
            { value: '', label: 'Anyone' },
            { value: 'me', label: 'Me' },
            { value: 'unassigned', label: 'Nobody' },
          ]}
        />
      </div>

      <StaleNote online={online} loadedAt={res.loadedAt} failed={Boolean(res.error) && Boolean(res.data)} />

      {res.data === undefined ? (
        res.error ? (
          <Notice
            kind={online ? 'error' : 'offline'}
            title={online ? "Couldn't load the queue." : "You're offline."}
            action={
              <button className="btn btn-small" type="button" onClick={res.reload}>
                Try again
              </button>
            }
          >
            {errorWords(res.error)}
          </Notice>
        ) : (
          <Skeleton label="Loading the queue" />
        )
      ) : res.data.items.length === 0 ? (
        <Empty title={stack.length > 1 ? 'No more cases.' : 'Nothing in the queue.'}>
          {stack.length > 1 ? 'Go back a page.' : 'No cases match these filters. New reports land here.'}
        </Empty>
      ) : (
        <div className="table-wrap" aria-busy={res.loading}>
          <table className="data">
            <caption className="sr-only">
              Cases, highest severity first, then oldest first. {count(res.data.items.length, 'case')} on this page.
            </caption>
            <thead>
              <tr className="label-sm">
                <th scope="col">Severity</th>
                <th scope="col">Reported</th>
                <th scope="col">Reasons</th>
                <th scope="col" className="num">
                  Reports
                </th>
                <th scope="col">Owner</th>
                <th scope="col">Age</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {res.data.items.map((c) => (
                <tr key={c.id}>
                  <td>
                    <SeverityTag severity={c.severity} />
                  </td>
                  <td style={{ maxWidth: 360 }}>
                    <a className="row-link" href={formatRoute({ name: 'report', id: c.id })}>
                      {kindWord(c.subject_kind)}
                    </a>{' '}
                    {c.content_hidden ? <HiddenTag /> : null}
                    <div className="body-sm muted" style={{ overflowWrap: 'anywhere' }}>
                      {c.preview ?? (c.subject_kind === 'moment' ? 'Photo' : 'No text')}
                    </div>
                  </td>
                  <td className="body-sm">{c.reasons.map(reasonWord).join(', ')}</td>
                  <td className="num">
                    {c.report_count}
                    <div className="caption muted">{count(c.reporter_count, 'person', 'people')}</div>
                  </td>
                  <td className="body-sm">
                    {c.owner ? (
                      <>
                        {c.owner.display_name ?? 'No name'}
                        {c.owner.handle ? <div className="caption muted">@{c.owner.handle}</div> : null}
                        {c.owner.paused ? <Tag tone="quiet">Paused</Tag> : null}
                      </>
                    ) : (
                      <span className="muted">Nobody</span>
                    )}
                  </td>
                  <td>
                    <AgeCell openedAt={c.opened_at} status={c.status} />
                  </td>
                  <td>
                    <StatusTag status={c.status} />
                    {c.assigned_to ? <div className="caption muted">{c.assigned_to.display_name ?? 'Staff'}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager
            label="Queue"
            page={stack.length}
            hasNext={Boolean(res.data.next_cursor)}
            onPage={(p) =>
              setPaging({ key: filterKey, stack: p > stack.length ? nextStack(stack, res.data?.next_cursor ?? null) : prevStack(stack) })
            }
          />
        </div>
      )}
    </>
  );
}
