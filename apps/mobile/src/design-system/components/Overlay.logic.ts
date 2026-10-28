/**
 * One overlay at a time (design-system README, Feedback and overlays: "Never
 * stack overlays"). Sheet and Modal ask this gate for the screen before they
 * show. The first to ask holds it; anyone who asks while it's held waits in
 * line and shows only when the holder releases it (closes and finishes
 * animating out). A waiting request is a bug in the caller — close the sheet,
 * then open the modal — so the gate reports it, but nothing ever draws on top
 * of another overlay.
 *
 * Toasts are not gated: they are a strip above the tab bar, not an overlay,
 * and ToastProvider keeps them to one at a time on its own.
 */

export type OverlayGate = {
  /** Ask for the screen. Idempotent. */
  request(id: string): void;
  /** Give the screen up (or leave the line). Idempotent. */
  release(id: string): void;
  /** The id that holds the screen, or null when nothing is shown. */
  active(): string | null;
  /** Called on every change. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
};

export type BlockedHandler = (waiting: string, holder: string) => void;

export function createOverlayGate(onBlocked?: BlockedHandler): OverlayGate {
  let line: readonly string[] = [];
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());

  return {
    request(id) {
      if (line.includes(id)) return;
      const holder = line[0];
      line = [...line, id];
      if (holder !== undefined) onBlocked?.(id, holder);
      emit();
    },
    release(id) {
      if (!line.includes(id)) return;
      line = line.filter((other) => other !== id);
      emit();
    },
    active() {
      return line[0] ?? null;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** The app-wide gate every Sheet and Modal uses. */
export const overlayGate = createOverlayGate((waiting, holder) => {
  console.warn(
    `[ojoro] Overlay "${waiting}" asked to open while "${holder}" is open. Overlays never stack: ` +
      'it will show once the first one closes. Close the first overlay before opening the next.',
  );
});
