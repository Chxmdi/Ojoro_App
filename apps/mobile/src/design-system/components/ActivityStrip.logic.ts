/**
 * Pure rules for `ActivityStrip` (web reference `function ActivityStrip`;
 * components/ActivityStrip.md). No React Native imports, so it runs in Node.
 */

export const ACTIVITY_STATUSES = ['forming', 'confirmed', 'live', 'full'] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

/** The trailing tag: the LIVE indicator, or a badge with its tone and word. */
export type ActivityTag =
  { kind: 'live' } | { kind: 'badge'; tone: 'neutral' | 'signal'; text: string };

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

/**
 * The row's label, in visual order (time, name, place, tag) with the tag's
 * visible words: "7:30, Pickup football, Jeanne-Mance Park, GAME ON". A
 * forming plan reads its count and the word: "…, 5 / 8, forming". The label
 * contains everything the row shows, so voice control and the web's
 * label-in-name check match it.
 */
export function activityStripLabel({
  activity,
  time,
  place,
  status = 'forming',
  count,
  capacity,
}: {
  activity: string;
  time: string;
  place: string;
  status?: ActivityStatus | undefined;
  count?: number | undefined;
  capacity?: number | undefined;
}): string {
  const tag = activityTag(status, count, capacity);
  const words =
    tag.kind === 'live'
      ? 'LIVE'
      : status === 'forming'
        ? count != null && capacity != null
          ? `${tag.text}, forming`
          : 'forming'
        : tag.text;
  return [time, activity, place, words].filter(Boolean).join(', ');
}
