/**
 * Pure rules for `AvailabilityGrid`, the free-time grid (`.slot` in
 * OnboardWhen.dc.html; DESIGN_SYSTEM_PORT §8). No React Native imports.
 *
 * Availability is rough free time, used only to find overlap. It's never a
 * calendar: no dates, no hours, no events; days of the week × parts of the day.
 */

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Day = (typeof DAYS)[number];

export const PARTS_OF_DAY = ['morning', 'midday', 'evening'] as const;
export type PartOfDay = (typeof PARTS_OF_DAY)[number];

/** One cell: "tue-evening". */
export type AvailabilitySlot = `${Day}-${PartOfDay}`;

export const DAY_NAMES: Record<Day, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

/** Row label, as the design writes it ("TUE"). */
export function dayShort(day: Day): string {
  return day.toUpperCase();
}

/** Column heading, as the design writes it ("EVENING"). */
export function partHeading(part: PartOfDay): string {
  return part.toUpperCase();
}

export function slotKey(day: Day, part: PartOfDay): AvailabilitySlot {
  return `${day}-${part}`;
}

/** "Tuesday evening, free" / "Tuesday evening, not set" (the prototype's wording). */
export function slotLabel(day: Day, part: PartOfDay, free: boolean): string {
  return `${DAY_NAMES[day]} ${part}, ${free ? 'free' : 'not set'}`;
}

const ORDER = new Map<string, number>(
  DAYS.flatMap((d, di) =>
    PARTS_OF_DAY.map((p, pi) => [slotKey(d, p), di * PARTS_OF_DAY.length + pi] as const),
  ),
);

/** Slots in week order (Monday morning first), without duplicates or unknown keys. */
export function normalizeSlots(slots: readonly string[]): AvailabilitySlot[] {
  return [...new Set(slots)]
    .filter((s): s is AvailabilitySlot => ORDER.has(s))
    .sort((a, b) => (ORDER.get(a) ?? 0) - (ORDER.get(b) ?? 0));
}

/** The value with `slot` turned on or off. Returns a new array in week order. */
export function toggleSlot(
  value: readonly AvailabilitySlot[],
  slot: AvailabilitySlot,
): AvailabilitySlot[] {
  return normalizeSlots(value.includes(slot) ? value.filter((s) => s !== slot) : [...value, slot]);
}

/** "3 times free" for the grid's summary label; "No free times set" for none. */
export function availabilitySummary(value: readonly AvailabilitySlot[]): string {
  const n = normalizeSlots(value).length;
  if (n === 0) return 'No free times set';
  return `${n} ${n === 1 ? 'time' : 'times'} free`;
}
