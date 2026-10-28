/**
 * Pure rules for `Stepper` (the `.step` pattern in HostSeries: − value +).
 * No React Native imports, so it runs in Node.
 */

export type StepperBounds = { min: number; max: number; step: number };

/** Keep `value` inside [min, max]. A min above max collapses to min. */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * The value after one step in `direction` (+1 or −1), clamped to the bounds.
 * Values off the step grid snap to it first, so 13 with step 2 from min 10
 * goes up to 14 and down to 12, never to 15 or 11.
 */
export function stepValue(value: number, direction: 1 | -1, { min, max, step }: StepperBounds): number {
  const size = step > 0 ? step : 1;
  const start = clamp(value, min, max);
  const offset = (start - min) / size;
  const index = direction > 0 ? Math.floor(offset + 1e-9) + 1 : Math.ceil(offset - 1e-9) - 1;
  // Round away floating-point dust from fractional steps (0.1 + 0.2).
  const next = Math.round((min + index * size) * 1e9) / 1e9;
  return clamp(next, min, max);
}

export function canDecrease(value: number, min: number): boolean {
  return value > min;
}

export function canIncrease(value: number, max: number): boolean {
  return value < max;
}

const plain = (n: number) => String(n);

export type StepperText = {
  /** Accessible names of the two buttons, built from `label`: "Decrease capacity". */
  decrease: string;
  increase: string;
  /** Spoken value, with the bound named when the value sits on one. */
  value: string;
  /** Why a button is disabled, or undefined while it works. Read as the button's hint. */
  decreaseReason?: string | undefined;
  increaseReason?: string | undefined;
};

/**
 * Words for the stepper. `label` is the thing being counted ("Capacity");
 * `format` turns a number into what is shown ("$12"), and the bounds use it too.
 */
export function stepperText(
  label: string,
  value: number,
  min: number,
  max: number,
  format: (n: number) => string = plain,
): StepperText {
  const thing = label.trim().toLowerCase();
  const shown = format(value);
  const atMin = !canDecrease(value, min);
  const atMax = !canIncrease(value, max);
  return {
    decrease: `Decrease ${thing}`,
    increase: `Increase ${thing}`,
    value: atMin ? `${shown}, the minimum` : atMax ? `${shown}, the maximum` : shown,
    decreaseReason: atMin ? `${label.trim()} can't go below ${format(min)}.` : undefined,
    increaseReason: atMax ? `${label.trim()} can't go above ${format(max)}.` : undefined,
  };
}
