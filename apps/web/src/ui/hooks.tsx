import { useCallback, useEffect, useRef, useState } from 'react';

/** True while the browser says it's online. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

/** True once `active` has stayed true for `ms` (skeletons appear only after 300ms). */
export function useDelayed(active: boolean, ms = 300): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const t = setTimeout(() => setShown(true), ms);
    return () => clearTimeout(t);
  }, [active, ms]);
  return shown;
}

export type Resource<T> = {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  /** When `data` last loaded, for "showing what loaded 3 min ago". */
  loadedAt: string | null;
  reload: () => void;
};

/**
 * Loads `load()` whenever `key` changes, keeping the last good data through errors and while
 * offline (the last-known state, with its age). Reloads when the browser comes back online.
 */
export function useResource<T>(key: string, load: () => Promise<T>): Resource<T> {
  const [state, setState] = useState<{
    data: T | undefined;
    error: unknown;
    loading: boolean;
    loadedAt: string | null;
    key: string;
  }>({ data: undefined, error: null, loading: true, loadedAt: null, key });
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const online = useOnline();

  useEffect(() => {
    let live = true;
    setState((s) => ({
      ...s,
      loading: true,
      error: null,
      ...(s.key !== key ? { data: undefined, loadedAt: null, key } : {}),
    }));
    loadRef.current().then(
      (data) => {
        if (live)
          setState({ data, error: null, loading: false, loadedAt: new Date().toISOString(), key });
      },
      (error: unknown) => {
        if (live) setState((s) => ({ ...s, error, loading: false }));
      },
    );
    return () => {
      live = false;
    };
  }, [key, tick, online]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return {
    data: state.data,
    error: state.error,
    loading: state.loading,
    loadedAt: state.loadedAt,
    reload,
  };
}
