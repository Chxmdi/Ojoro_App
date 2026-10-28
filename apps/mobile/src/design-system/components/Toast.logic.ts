/**
 * Toast rules, kept free of React Native so they run under Vitest.
 * Spec: design-handoff/design-system/components/Toast.md.
 */

export type ToastKind = 'neutral' | 'success' | 'offline' | 'error';

/** The icon that tells the kind (never a colour). Neutral has none. */
export const TOAST_ICON = {
  neutral: null,
  success: 'check',
  offline: 'offline',
  error: 'alert',
} as const satisfies Record<ToastKind, string | null>;

/** Errors interrupt (assertive); everything else waits its turn (polite). */
export function toastLiveness(kind: ToastKind): 'polite' | 'assertive' {
  return kind === 'error' ? 'assertive' : 'polite';
}

/** 4s by default (Toast.md). */
export const TOAST_DURATION = 4000;
/** 8s when the toast carries an action, so there's time to reach it. */
export const TOAST_DURATION_WITH_ACTION = 8000;
/** Screen-reader users hear the sentence first and then have to find the action: double the time. */
export const SCREEN_READER_FACTOR = 2;

/** How long a toast stays before it dismisses itself, in ms. */
export function toastDuration({
  action,
  screenReader = false,
}: {
  action?: string | undefined;
  screenReader?: boolean | undefined;
}): number {
  const base = action ? TOAST_DURATION_WITH_ACTION : TOAST_DURATION;
  return screenReader ? base * SCREEN_READER_FACTOR : base;
}

/** What gets announced. Errors say so in words, since the alert icon is silent. */
export function toastAnnouncement(message: string, kind: ToastKind): string {
  return kind === 'error' ? `Error. ${message}` : message;
}

/* ---------- One at a time ---------- */

export type ToastEntry<T> = T & { id: number };

export type ToastState<T> = {
  /** The one toast on screen, or null. Never more than one. */
  current: ToastEntry<T> | null;
};

export type ToastAction<T> =
  /** The caller numbers toasts (a counter in the provider), so `show` can return the id at once. */
  | { type: 'show'; toast: T; id: number }
  /** Dismiss by id, so a stale timer or a late tap on an old toast can't close the new one. */
  | { type: 'dismiss'; id: number };

export function initialToastState<T>(): ToastState<T> {
  return { current: null };
}

/** A new toast replaces the current one; toasts never queue or stack. */
export function toastReducer<T>(state: ToastState<T>, action: ToastAction<T>): ToastState<T> {
  switch (action.type) {
    case 'show':
      return { current: { ...action.toast, id: action.id } };
    case 'dismiss':
      return state.current?.id === action.id ? { current: null } : state;
  }
}
