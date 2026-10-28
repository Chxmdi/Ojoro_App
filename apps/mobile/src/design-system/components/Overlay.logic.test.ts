import { describe, expect, it, vi } from 'vitest';

import { createOverlayGate, overlayGate } from './Overlay.logic';

describe('overlay gate', () => {
  it('is empty at first', () => {
    expect(createOverlayGate().active()).toBeNull();
  });

  it('gives the screen to the first overlay that asks', () => {
    const gate = createOverlayGate();
    gate.request('sheet');
    expect(gate.active()).toBe('sheet');
  });

  it('never stacks: a second overlay waits and shows when the first releases', () => {
    const blocked = vi.fn();
    const gate = createOverlayGate(blocked);
    gate.request('sheet');
    gate.request('modal');
    expect(gate.active()).toBe('sheet');
    expect(blocked).toHaveBeenCalledWith('modal', 'sheet');
    gate.release('sheet');
    expect(gate.active()).toBe('modal');
    gate.release('modal');
    expect(gate.active()).toBeNull();
  });

  it('is idempotent for request and release', () => {
    const blocked = vi.fn();
    const gate = createOverlayGate(blocked);
    gate.request('a');
    gate.request('a');
    expect(blocked).not.toHaveBeenCalled();
    gate.release('b');
    gate.release('a');
    gate.release('a');
    expect(gate.active()).toBeNull();
  });

  it('lets a waiting overlay leave the line without showing', () => {
    const gate = createOverlayGate();
    gate.request('a');
    gate.request('b');
    gate.release('b');
    gate.release('a');
    expect(gate.active()).toBeNull();
  });

  it('notifies subscribers on change only, until they unsubscribe', () => {
    const gate = createOverlayGate();
    const listener = vi.fn();
    const off = gate.subscribe(listener);
    gate.request('a');
    gate.request('a');
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    gate.release('a');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('warns in the app-wide gate when an overlay would stack', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    overlayGate.request('x');
    overlayGate.request('y');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('never stack');
    overlayGate.release('x');
    overlayGate.release('y');
    warn.mockRestore();
  });
});
