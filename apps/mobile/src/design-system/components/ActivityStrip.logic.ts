/**
 * Pure rules for `ActivityStrip` (web reference `function ActivityStrip`;
 * components/ActivityStrip.md). No React Native imports, so it runs in Node.
 */

export const ACTIVITY_STATUSES = ['forming', 'confirmed', 'live', 'full'] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

/** The trailing tag: the LIVE indicator, or a badge with its tone and word. */
export type ActivityTag = { kind: 'live' } | { kind: 'badge'; tone: 'neutral' | 'signal'; text: string };

/** `live` → LIVE · `confirmed` → GAME ON (signal) · `full` → FULL · `forming` → "5 / 8". */
export function activityTag(
  status: ActivityStatus = 'forming',
  count?: number,
  capacity?: number,
): ActivityTag {
  if (status === 'live') return { kind: 'live' };
  if (status === 'confirmed') return { kind: 'badge', tone: 'signal', text: 'GAME ON' };
  if (status === 'full') return { kind: 'badge', tone: 'neutral', text: 'FULL' };
  return { kind: 'badge', tone: 'neutral', text: `${count ?? ''} / ${capacity ?? ''}`.trim() };
}

/** The web's `aria-label`: "Pickup football, 7:30, Jeanne-Mance Park, full". */
export function activityStripLabel({
  activity,
  time,
  place,
  status = 'forming',
}: {
  activity: string;
  time: string;
  place: string;
  status?: ActivityStatus | undefined;
}): string {
  return `${activity}, ${time}, ${place}, ${status}`;
}
