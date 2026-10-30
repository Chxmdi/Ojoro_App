import { useState, type FormEvent } from 'react';

import { api, newKey } from '../api';
import { errorWords } from '../lib/errors';
import { count, humanize } from '../lib/format';
import { undoFor, undoReason, type Undo } from '../lib/moderation';
import { withParams, type Route } from '../lib/route';
import type { StaffPlace } from '../lib/types';
import { ActionDialog, type ActionSpec } from '../ui/ActionDialog';
import { Filter } from '../ui/Filter';
import { Icon } from '../ui/Icon';
import { useResource } from '../ui/hooks';
import { Empty, Notice, Skeleton, StaleNote, Tag, Toast } from '../ui/kit';

type PlacesRoute = Extract<Route, { name: 'places' }>;

export function Places({ route, go, online }: { route: PlacesRoute; go: (r: Route) => void; online: boolean }) {
  const q = route.params.q ?? '';
  const sensitive = route.params.sensitive === 'yes' ? true : route.params.sensitive === 'no' ? false : null;
  const res = useResource(`places:${q}:${String(sensitive)}`, () => api.places(q || null, sensitive));
  const [draft, setDraft] = useState(q);
  const [spec, setSpec] = useState<ActionSpec | null>(null);
  const [toast, setToast] = useState<{ message: string; undo: Undo | null; reason: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stale = !online || (Boolean(res.error) && Boolean(res.data));

  const search = (e: FormEvent) => {
    e.preventDefault();
    go(withParams(route, { q: draft.trim() }));
  };

  const toggle = (p: StaffPlace) => {
    const next = !p.sensitive;
    const key = newKey();
    setSpec({
      title: next ? `Mark ${p.name} sensitive?` : `Mark ${p.name} not sensitive?`,
      body: next
        ? 'It stops being its own marker on Ojoro Pulse and only counts in its area once three or more games happen there. Plans and games can still use it.'
        : 'It shows on Ojoro Pulse as a place again, with its own activity.',
      confirmLabel: next ? 'Mark sensitive' : 'Mark not sensitive',
      run: async (v) => {
        const r = await api.setPlaceSensitive(p.id, next, v.reason, key);
        setToast({
          message: r.changed ? (next ? `${p.name} is sensitive now.` : `${p.name} isn't sensitive now.`) : 'Already so. Nothing changed.',
          undo: undoFor('place_sensitive', { changed: r.changed, place_id: p.id, sensitive: next }),
          reason: v.reason,
        });
        res.reload();
      },
    });
  };

  const undo = async (u: Undo, reason: string) => {
    setToast(null);
    if (u.kind !== 'place_sensitive') return;
    try {
      await api.setPlaceSensitive(u.place_id, u.sensitive, undoReason(reason), newKey());
      setToast({ message: 'Undone.', undo: null, reason: '' });
    } catch (thrown) {
      setError(errorWords(thrown));
    }
    res.reload();
  };

  return (
    <>
      <div className="page-head">
        <div>
          <p className="label muted">Privacy</p>
          <h1 className="display display-sm">Place sensitivity</h1>
        </div>
        <p className="body-sm muted" style={{ maxWidth: 420 }}>
          Sensitive places (clinics, shelters, places of worship, schools) never get their own Pulse marker.
        </p>
      </div>
      <div className="filters">
        <form className="row" onSubmit={search} role="search" style={{ alignItems: 'flex-end' }}>
          <div className="field">
            <label className="label-sm" htmlFor="place-q">
              Name or area
            </label>
            <input id="place-q" className="input" type="search" value={draft} onChange={(e) => setDraft(e.target.value)} />
          </div>
          <button type="submit" className="btn">
            <Icon name="search" size={16} /> Search
          </button>
        </form>
        <Filter
          id="f-sensitive"
          label="Sensitive"
          value={route.params.sensitive ?? ''}
          onChange={(v) => go(withParams(route, { sensitive: v }))}
          options={[
            { value: '', label: 'Any' },
            { value: 'yes', label: 'Sensitive' },
            { value: 'no', label: 'Not sensitive' },
          ]}
        />
      </div>
      <StaleNote online={online} loadedAt={res.loadedAt} failed={Boolean(res.error) && Boolean(res.data)} />
      {error ? <Notice kind="error" title="That didn't go through.">{error}</Notice> : null}
      {res.data === undefined ? (
        res.error ? (
          <Notice
            kind={online ? 'error' : 'offline'}
            title={online ? "Couldn't load places." : "You're offline."}
            action={
              <button className="btn btn-small" type="button" onClick={res.reload}>
                Try again
              </button>
            }
          >
            {errorWords(res.error)}
          </Notice>
        ) : (
          <Skeleton label="Loading places" />
        )
      ) : res.data.items.length === 0 ? (
        <Empty title="No places found.">{q ? `Nothing matches “${q}”.` : 'Try another filter.'}</Empty>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <caption className="sr-only">{count(res.data.items.length, 'place')}</caption>
            <thead>
              <tr className="label-sm">
                <th scope="col">Place</th>
                <th scope="col">Area</th>
                <th scope="col">Sports</th>
                <th scope="col">Sensitive</th>
                <th scope="col">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {res.data.items.map((p) => (
                <tr key={p.id}>
                  <td className="title-sm">{p.name}</td>
                  <td className="body-sm">{[p.area, p.city].filter(Boolean).join(', ') || '–'}</td>
                  <td className="body-sm">{p.sport_ids.map(humanize).join(', ') || '–'}</td>
                  <td>
                    {p.sensitive ? (
                      <Tag tone="strong" icon="pin">
                        Sensitive
                      </Tag>
                    ) : (
                      <span className="body-sm muted">Not sensitive</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button type="button" className="btn btn-small" disabled={stale} onClick={() => toggle(p)} aria-label={`${p.sensitive ? 'Mark not sensitive' : 'Mark sensitive'}: ${p.name}`}>
                      {p.sensitive ? 'Mark not sensitive' : 'Mark sensitive'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ActionDialog spec={spec} onClose={() => setSpec(null)} online={online} />
      {toast ? (
        <Toast
          message={toast.message}
          {...(toast.undo ? { action: { label: 'Undo', onPress: () => void undo(toast.undo!, toast.reason) } } : {})}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </>
  );
}
