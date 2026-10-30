import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';

import { api } from './api';
import { errorOf, errorWords } from './lib/errors';
import { formatRoute, parseRoute, type Route } from './lib/route';
import { Appeals } from './screens/Appeals';
import { AuditLog } from './screens/AuditLog';
import { People, Person } from './screens/People';
import { Places } from './screens/Places';
import { Queue } from './screens/Queue';
import { ReportDetail } from './screens/ReportDetail';
import { SignIn } from './screens/SignIn';
import { config, supabase } from './supabase';
import { Icon } from './ui/Icon';
import { useOnline } from './ui/hooks';
import { Notice, Skeleton } from './ui/kit';

type Gate =
  | { state: 'loading' }
  | { state: 'signed_out'; refusal: string | null; round: number }
  | { state: 'error'; message: string }
  | { state: 'staff'; session: Session; role: string };

export type Staff = { id: string; role: string };

function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = useCallback((r: Route) => {
    window.location.hash = formatRoute(r);
  }, []);
  return [route, go];
}

const NAV: { name: Route['name']; label: string }[] = [
  { name: 'queue', label: 'Queue' },
  { name: 'appeals', label: 'Appeals' },
  { name: 'people', label: 'People' },
  { name: 'audit', label: 'Audit log' },
  { name: 'places', label: 'Places' },
];

export function App() {
  const [gate, setGate] = useState<Gate>({ state: 'loading' });
  const [route, go] = useRoute();
  const online = useOnline();

  const check = useCallback(async (session: Session | null) => {
    if (!supabase) return;
    if (!session) {
      setGate((g) =>
        g.state === 'signed_out' ? g : { state: 'signed_out', refusal: null, round: 0 },
      );
      return;
    }
    try {
      const role = await api.myStaffRole();
      if (role === 'moderator' || role === 'admin') {
        setGate({ state: 'staff', session, role });
      } else {
        // Not staff: end the session here so nothing else in the tool is reachable.
        await supabase.auth.signOut({ scope: 'local' });
        setGate({
          state: 'signed_out',
          refusal: "This account isn't staff. The admin tool is for Ojoro staff only.",
          round: Date.now(),
        });
      }
    } catch (thrown) {
      const e = errorOf(thrown);
      if (e.code === 'account_paused' || e.code === 'not_authenticated') {
        await supabase.auth.signOut({ scope: 'local' });
        setGate({ state: 'signed_out', refusal: errorWords(thrown), round: Date.now() });
      } else setGate({ state: 'error', message: errorWords(thrown) });
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let current: string | null = null;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // Token refreshes keep the same person; only re-check when who is signed in changes.
      const who = session?.user.id ?? null;
      if (event === 'TOKEN_REFRESHED' && who === current) return;
      current = who;
      void check(session);
    });
    return () => data.subscription.unsubscribe();
  }, [check]);

  if (!config.ok) {
    return (
      <main className="signin" id="main">
        <h1 className="display display-sm">Setup needed</h1>
        <Notice kind="error" title="The admin tool isn't configured.">
          <ul>
            {config.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          Set these in apps/web/.env (see apps/web/.env.example).
        </Notice>
      </main>
    );
  }

  if (gate.state === 'loading') {
    return (
      <main className="signin" id="main">
        <Skeleton rows={3} label="Checking your session" />
      </main>
    );
  }
  if (gate.state === 'error') {
    return (
      <main className="signin" id="main">
        <h1 className="display display-sm">Sign in</h1>
        <Notice
          kind={online ? 'error' : 'offline'}
          title={online ? "We couldn't check your account." : "You're offline."}
          action={
            <button
              className="btn btn-small"
              type="button"
              onClick={() =>
                void supabase?.auth.getSession().then(({ data }) => check(data.session))
              }
            >
              Try again
            </button>
          }
        >
          {gate.message}
        </Notice>
      </main>
    );
  }
  if (gate.state === 'signed_out') {
    // A new round (after a refusal) starts the form again from the phone number.
    return (
      <SignIn
        key={gate.round}
        refusal={gate.refusal}
        onClearRefusal={() =>
          setGate((g) => (g.state === 'signed_out' ? { ...g, refusal: null } : g))
        }
      />
    );
  }

  const staff: Staff = { id: gate.session.user.id, role: gate.role };
  const section =
    route.name === 'report' ? 'queue' : route.name === 'person' ? 'people' : route.name;

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {!online ? (
        <div className="offline-bar label" role="status">
          <Icon name="offline" size={18} /> Offline. Showing the last loaded data. Actions are off.
        </div>
      ) : null}
      <header className="topbar">
        <a className="brand" href="#/queue">
          <span className="display display-xs">Ojoro</span>
          <span className="label">Staff</span>
        </a>
        <nav className="nav label" aria-label="Sections">
          {NAV.map((n) => (
            <a
              key={n.name}
              href={`#/${n.name}`}
              aria-current={section === n.name ? 'page' : undefined}
            >
              {n.label}
            </a>
          ))}
        </nav>
        <div className="who">
          <span className="body-sm">
            Signed in as{' '}
            <span className="tag">{staff.role === 'admin' ? 'Admin' : 'Moderator'}</span>
          </span>
          <button
            className="btn btn-small"
            type="button"
            onClick={() => void supabase?.auth.signOut({ scope: 'local' })}
          >
            Sign out
          </button>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        {route.name === 'queue' ? <Queue route={route} go={go} online={online} /> : null}
        {route.name === 'report' ? (
          <ReportDetail id={route.id} staff={staff} online={online} />
        ) : null}
        {route.name === 'appeals' ? <Appeals route={route} go={go} online={online} /> : null}
        {route.name === 'audit' ? <AuditLog route={route} go={go} online={online} /> : null}
        {route.name === 'people' ? <People route={route} go={go} online={online} /> : null}
        {route.name === 'person' ? (
          <Person key={route.id} id={route.id} staff={staff} online={online} />
        ) : null}
        {route.name === 'places' ? <Places route={route} go={go} online={online} /> : null}
      </main>
    </>
  );
}
