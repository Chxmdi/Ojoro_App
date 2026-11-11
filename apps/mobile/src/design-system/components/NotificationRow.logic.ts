/**
 * Pure rules for `NotificationRow` and `NotificationGroup` (Notifications:
 * "Updates grouped Needs you / Today / Earlier; each row deep-links to its
 * canonical object with one inline action"). No React Native imports.
 */

/**
 * The leading disc's ground. `quiet`: a 2px `line-strong` ring (Today,
 * Earlier). `strong`: a 2px `text` ring (Needs you). `signal`: a filled
 * `signal` disc for a threshold reached (GAME ON).
 */
export const NOTIFICATION_TONES = ['quiet', 'strong', 'signal'] as const;
export type NotificationTone = (typeof NOTIFICATION_TONES)[number];

/** The group's divider label: "NEEDS YOU · 3", "TODAY". */
export function groupLabel(title: string, count?: number | undefined): string {
  const t = title.toUpperCase();
  return count && count > 0 ? `${t} · ${Math.floor(count)}` : t;
}

/** The group read aloud: "Needs you, 3". */
export function groupSpoken(title: string, count?: number | undefined): string {
  const t = title.charAt(0).toUpperCase() + title.slice(1).toLowerCase();
  return count && count > 0 ? `${t}, ${Math.floor(count)}` : t;
}

/**
 * The row read as one item, in visual order with the visible words (NEW
 * reads "New"): "Basketball needs one more. Sat 10:00 · Parc La Fontaine ·
 * 7 / 8. New. 4 min ago". The label contains what the row shows, so voice
 * control ("tap Basketball…") and the web's label-in-name check both match.
 */
export function notificationLabel(p: {
  title: string;
  body?: string | undefined;
  time?: string | undefined;
  unread?: boolean | undefined;
}): string {
  const end = (s: string) => (/[.!?…]$/.test(s) ? s : `${s}.`);
  return [end(p.title), p.body ? end(p.body) : null, p.unread ? 'New.' : null, p.time]
    .filter(Boolean)
    .join(' ');
}
