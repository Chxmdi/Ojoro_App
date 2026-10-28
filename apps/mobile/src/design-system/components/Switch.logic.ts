/**
 * Pure rules for `Switch` (the `.sw` pattern in HostSeries, HostRequests and
 * HostAnnounce). No React Native imports, so it runs in Node.
 */

/** The word drawn inside the control, so the state reads without colour. */
export function switchWord(value: boolean): 'ON' | 'OFF' {
  return value ? 'ON' : 'OFF';
}

/** Control geometry from `.sw`: 72×32 pill, 1px border, 24px knob. */
export const SWITCH = {
  width: 72,
  height: 32,
  border: 1,
  knob: 24,
  /** Gap between the knob and the pill's inner edge (vertical: (32 − 2 − 24) / 2). */
  knobInset: 3,
  /** Gap between the word and the pill's inner edge, on the side away from the knob. */
  wordInset: 10,
} as const;

/**
 * Knob offset from the inner left edge. OFF: knob on the left, word on the right.
 * ON: knob slides right, word on the left (`.sw.on` is `row-reverse`).
 */
export function knobOffset(value: boolean): number {
  const inner = SWITCH.width - 2 * SWITCH.border;
  return value ? inner - SWITCH.knobInset - SWITCH.knob : SWITCH.knobInset;
}
