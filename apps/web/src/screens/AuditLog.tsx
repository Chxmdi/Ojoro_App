import { api } from '../api';
import { AUDIT_ACTIONS, auditActionsFilter, auditWord } from '../lib/audit';
import { errorWords } from '../lib/errors';
import { withParams, type Route } from '../lib/route';
import { AuditRows } from '../ui/AuditRows';
import { Filter } from '../ui/Filter';
import { useResource } from '../ui/hooks';
import { Empty, Notice, Pager, Skeleton, StaleNote } from '../ui/kit';
import { useCursorPaging } from '../ui/useCursorPaging';

const UUID = /^[0-9a-f-]{36}$/i;

export function AuditLog({ route, go, online }: { route: Extract<Route, { name: 'audit' }>; go: (r: Route) => void; online: boolean }) {
  const f = {
    p_actions: auditActionsFilter(route.params.action ?? 'writes'),
    p_case_id: route.params.case && UUID.test(route.params.case) ? route.params.case : null,
    p_target_user: route.params.user && UUID.test(route.params.user) ? route.params.user : null,
    p_actor: null,
  };
  const key = JSON.stringify(f);
  const paging = useCursorPaging(key);
  const res = useResource(`${key}|${paging.cursor ?? ''}`, () => api.audit(f, paging.cursor));

  return (
    <>
      <div className="page-head">
        <div>
          <p className="label muted">Every staff action and read</p>
          <h1 className="display display-sm">Audit log</h1>
        </div>
        <p className="body-sm muted">Append-only. Nobody can change or delete an entry.</p>
      </div>
      <div className="filters" role="group" aria-label="Filter the audit log">
        <Filter
          id="f-action"
          label="Show"
          value={route.params.action ?? 'writes'}
          onChange={(v) => go(withParams(route, { action: v === 'writes' ? undefined : v }))}
          options={[
            { value: 'writes', label: 'Actions' },
            { value: 'reads', label: 'Reads of personal data' },
            { value: 'all', label: 'Everything' },
            ...AUDIT_ACTIONS.map((a) => ({ value: a, label: auditWord(a) })),
          ]}
        />
        {f.p_case_id || f.p_target_user ? (
          <button type="button" className="btn btn-small" onClick={() => go(withParams(route, { case: undefined, user: undefined }))}>
            Clear case and person filter
          </button>
        ) : null}
      </div>
      <StaleNote online={online} loadedAt={res.loadedAt} failed={Boolean(res.error) && Boolean(res.data)} />
      {res.data === undefined ? (
        res.error ? (
          <Notice
            kind={online ? 'error' : 'offline'}
            title={online ? "Couldn't load the audit log." : "You're offline."}
            action={
              <button className="btn btn-small" type="button" onClick={res.reload}>
                Try again
              </button>
            }
          >
            {errorWords(res.error)}
          </Notice>
        ) : (
          <Skeleton label="Loading the audit log" />
        )
      ) : res.data.items.length === 0 ? (
        <Empty title="No entries.">Nothing matches this filter.</Empty>
      ) : (
        <>
          <AuditRows entries={res.data.items} />
          <Pager
            label="Audit log"
            page={paging.page}
            hasNext={Boolean(res.data.next_cursor)}
            onPage={(p) => (p > paging.page ? paging.next(res.data?.next_cursor ?? null) : paging.prev())}
          />
        </>
      )}
    </>
  );
}
