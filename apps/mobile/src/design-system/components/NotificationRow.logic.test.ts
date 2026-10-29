import { describe, expect, it } from 'vitest';

import { groupLabel, groupSpoken, notificationLabel } from './NotificationRow.logic';

describe('NotificationRow logic', () => {
  it('labels groups with their count', () => {
    expect(groupLabel('Needs you', 3)).toBe('NEEDS YOU · 3');
    expect(groupLabel('TODAY')).toBe('TODAY');
    expect(groupLabel('Today', 0)).toBe('TODAY');
    expect(groupSpoken('NEEDS YOU', 3)).toBe('Needs you, 3');
    expect(groupSpoken('EARLIER')).toBe('Earlier');
  });

  it('reads the row, unread first', () => {
    expect(
      notificationLabel({
        title: 'Basketball needs one more.',
        body: 'Sat 10:00 · Parc La Fontaine · 7 / 8',
        time: '4 min ago',
        unread: true,
      }),
    ).toBe('Unread. Basketball needs one more. Sat 10:00 · Parc La Fontaine · 7 / 8. 4 min ago');
    expect(notificationLabel({ title: 'Lena joined Thursday FC' })).toBe(
      'Lena joined Thursday FC.',
    );
  });
});
