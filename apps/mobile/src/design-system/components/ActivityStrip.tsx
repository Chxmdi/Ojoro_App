import type { Href } from 'expo-router';

import { activityStripLabel, activityTag, type ActivityStatus } from './ActivityStrip.logic';
import { Badge } from './Badge';
import { LiveIndicator } from './LiveIndicator';
import { Strip } from './Strip';

export { ACTIVITY_STATUSES, type ActivityStatus } from './ActivityStrip.logic';

export type ActivityStripProps = {
  activity: string;
  /** Set in the display face in the 72pt leading column ("7:30"). */
  time: string;
  /** An area, never an address ("Parc Jarry · 4 km"). */
  place: string;
  count?: number | undefined;
  capacity?: number | undefined;
  /** `forming` (count boxed, default) · `confirmed` (GAME ON) · `live` (LIVE) · `full` (FULL). */
  status?: ActivityStatus | undefined;
  /** Opens the activity (Expo Router). The whole row is one link. */
  href?: Href | undefined;
  onPress?: (() => void) | undefined;
};

/**
 * The LIVE tag is `LiveIndicator`. `LiveTag` stays as an alias so existing
 * imports keep working.
 */
export const LiveTag = LiveIndicator;

/**
 * Compact one-line activity (ActivityStrip.md, web `function ActivityStrip`):
 * the time in display type, name and place in UI type, status at the end. Built
 * on `Strip`, so strips stack on `line` hairlines, never as cards, and the
 * whole row is one link at least 44pt tall.
 */
export function ActivityStrip({
  activity,
  time,
  place,
  count,
  capacity,
  status = 'forming',
  href,
  onPress,
}: ActivityStripProps) {
  const tag = activityTag(status, count, capacity);
  return (
    <Strip
      leading={time}
      title={activity}
      meta={place}
      trailing={
        tag.kind === 'live' ? (
          <LiveIndicator decorative />
        ) : (
          <Badge tone={tag.tone}>{tag.text}</Badge>
        )
      }
      href={href}
      onPress={onPress}
      accessibilityLabel={activityStripLabel({ activity, time, place, status })}
    />
  );
}
