import { describe, expect, it } from 'vitest';

import {
  initialToastState,
  TOAST_ICON,
  toastAnnouncement,
  toastDuration,
  toastLiveness,
  toastReducer,
} from './Toast.logic';

type T = { message: string };

describe('toastDuration', () => {
  it('is 4s by default and 8s with an action', () => {
    expect(toastDuration({})).toBe(4000);
    expect(toastDuration({ action: 'UNDO' })).toBe(8000);
  });

  it('doubles for screen-reader users', () => {
    expect(toastDuration({ screenReader: true })).toBe(8000);
    expect(toastDuration({ action: 'RETRY', screenReader: true })).toBe(16000);
  });

  it('treats an empty action as no action', () => {
    expect(toastDuration({ action: '' })).toBe(4000);
  });
});

describe('toast kind', () => {
  it('is told by icon, not colour', () => {
    expect(TOAST_ICON).toEqual({
      neutral: null,
      success: 'check',
      offline: 'offline',
      error: 'alert',
    });
  });

  it('is assertive only for errors', () => {
    expect(toastLiveness('error')).toBe('assertive');
    expect(toastLiveness('neutral')).toBe('polite');
    expect(toastLiveness('success')).toBe('polite');
    expect(toastLiveness('offline')).toBe('polite');
  });

  it('says "Error" in words for errors', () => {
    expect(toastAnnouncement("Couldn't join.", 'error')).toBe("Error. Couldn't join.");
    expect(toastAnnouncement('Saved.', 'success')).toBe('Saved.');
  });
});

describe('toastReducer', () => {
  it('starts empty', () => {
    expect(initialToastState<T>()).toEqual({ current: null });
  });

  it('shows one toast and gives it an id', () => {
    const s = toastReducer(initialToastState<T>(), {
      type: 'show',
      toast: { message: 'a' },
      id: 1,
    });
    expect(s.current).toEqual({ message: 'a', id: 1 });
  });

  it('replaces the current toast instead of stacking', () => {
    let s = toastReducer(initialToastState<T>(), { type: 'show', toast: { message: 'a' }, id: 1 });
    s = toastReducer(s, { type: 'show', toast: { message: 'b' }, id: 2 });
    expect(s.current).toEqual({ message: 'b', id: 2 });
  });

  it('dismisses only the toast it was asked to', () => {
    let s = toastReducer(initialToastState<T>(), { type: 'show', toast: { message: 'a' }, id: 1 });
    s = toastReducer(s, { type: 'show', toast: { message: 'b' }, id: 2 });
    const stale = toastReducer(s, { type: 'dismiss', id: 1 });
    expect(stale).toBe(s);
    expect(toastReducer(s, { type: 'dismiss', id: 2 }).current).toBeNull();
  });

  it('ignores a dismiss when nothing is shown', () => {
    const s = initialToastState<T>();
    expect(toastReducer(s, { type: 'dismiss', id: 1 })).toBe(s);
  });
});
