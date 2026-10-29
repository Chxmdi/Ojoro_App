import { describe, expect, it } from 'vitest';

import {
  bellLabel,
  hasUnread,
  hhmm,
  inlineAction,
  leadingFor,
  muteKindLabel,
  muteUntilLabel,
  newestUpdatedAt,
  notificationTime,
  pushOn,
  QUIET_STARTS,
  quietCaption,
  quietOptions,
  quietTime,
  seenUnread,
  stickyNeedsYou,
  withHeldNeedsYou,
  toneFor,
  TYPE_SETTINGS,
  type NotificationFacts,
} from './logic';

const TZ = 'America/Toronto';

function row(over: Partial<NotificationFacts> = {}): NotificationFacts {
  return {
    id: 'n1',
    type: 'need_one_more',
    section: 'needs_you',
    needs_you: true,
    action: 'im_down',
    href: '/plan/p1',
    plan_id: 'p1',
    activity_id: null,
    actor_names: [],
    updated_at: '2026-10-29T17:00:00Z',
    read_at: null,
    ...over,
  };
}

describe('leadingFor', () => {
  it('draws the person who joined a crew', () => {
    expect(leadingFor({ type: 'crew_member_joined', actor_names: ['Lena R'] })).toEqual({ kind: 'person', name: 'Lena R' });
    expect(leadingFor({ type: 'crew_member_joined', actor_names: [] })).toEqual({ kind: 'icon', icon: 'people' });
    expect(leadingFor({ type: 'crew_member_joined', actor_names: null })).toEqual({ kind: 'icon', icon: 'people' });
  });

  it('picks an icon or graphic per type', () => {
    const cases: [NotificationFacts['type'], unknown][] = [
      ['need_one_more', { kind: 'icon', icon: 'people' }],
      ['participant_update', { kind: 'icon', icon: 'people' }],
      ['pull_in_invite', { kind: 'icon', icon: 'people' }],
      ['run_it_back_invite', { kind: 'icon', icon: 'people' }],
      ['crew_poll', { kind: 'icon', icon: 'chat' }],
      ['crew_plan', { kind: 'icon', icon: 'chat' }],
      ['mention', { kind: 'icon', icon: 'chat' }],
      ['game_on', { kind: 'icon', icon: 'check' }],
      ['waitlist_promoted', { kind: 'icon', icon: 'check' }],
      ['check_in_open', { kind: 'icon', icon: 'clock' }],
      ['activity_changed', { kind: 'icon', icon: 'alert' }],
      ['live', { kind: 'icon', icon: 'lights' }],
      ['result_to_confirm', { kind: 'icon', icon: 'compete' }],
      ['recap_ready', { kind: 'graphic', graphic: 'o' }],
      ['challenge_response', { kind: 'graphic', graphic: 'mark' }],
    ];
    for (const [type, want] of cases) expect(leadingFor({ type, actor_names: [] })).toEqual(want);
    expect(leadingFor({ type: 'something_new' as never, actor_names: [] })).toEqual({ kind: 'icon', icon: 'bell' });
  });
});

describe('toneFor', () => {
  it('fills GAME ON, rings Needs you, quiets the rest', () => {
    expect(toneFor({ type: 'game_on', needs_you: false })).toBe('signal');
    expect(toneFor({ type: 'need_one_more', needs_you: true })).toBe('strong');
    expect(toneFor({ type: 'recap_ready', needs_you: false })).toBe('quiet');
  });
});

describe('inlineAction', () => {
  it('has no button outside Needs you', () => {
    expect(inlineAction(row({ needs_you: false, section: 'today' }))).toBeNull();
    expect(inlineAction(row({ action: 'open' }))).toBeNull();
  });

  it("runs I'M DOWN and CONFIRM here", () => {
    expect(inlineAction(row())).toEqual({ kind: 'rpc', action: 'im_down', label: "I'M DOWN", primary: true });
    expect(inlineAction(row({ plan_id: null }))).toBeNull();
    expect(inlineAction(row({ action: 'confirm_result', activity_id: 'a1', plan_id: null }))).toEqual({
      kind: 'rpc',
      action: 'confirm_result',
      label: 'CONFIRM',
      primary: false,
    });
    expect(inlineAction(row({ action: 'confirm_result', activity_id: null }))).toBeNull();
  });

  it('opens the screen for the others', () => {
    expect(inlineAction(row({ action: 'vote', href: '/crew/c1/chat' }))).toMatchObject({ kind: 'go', label: 'VOTE', href: '/crew/c1/chat', actsOnOpen: false });
    expect(inlineAction(row({ action: 'reply', href: '/crew/c1/chat' }))).toMatchObject({ label: 'REPLY', actsOnOpen: true });
    expect(inlineAction(row({ action: 'check_in', activity_id: 'a1' }))).toMatchObject({ label: 'CHECK IN', href: '/activity/a1/check-in' });
    expect(inlineAction(row({ action: 'check_in', activity_id: null, href: '/x' }))).toMatchObject({ href: '/x' });
    expect(inlineAction(row({ action: 'pull_in' }))).toMatchObject({ label: 'PULL SOMEONE IN', href: '/plan/p1/pull-in' });
    expect(inlineAction(row({ action: 'pull_in', plan_id: null, href: '/y' }))).toMatchObject({ href: '/y' });
  });
});

describe('notificationTime', () => {
  const now = new Date('2026-10-29T18:00:00Z'); // 2:00 PM in Toronto
  it('counts minutes and hours while recent', () => {
    expect(notificationTime('2026-10-29T17:59:40Z', now, TZ)).toBe('Just now');
    expect(notificationTime('2026-10-29T17:56:00Z', now, TZ)).toBe('4 min ago');
    expect(notificationTime('2026-10-29T16:00:00Z', now, TZ)).toBe('2 h ago');
  });
  it('then the time, Yesterday, the weekday, the date', () => {
    expect(notificationTime('2026-10-29T13:20:00Z', now, TZ)).toBe('9:20 AM');
    expect(notificationTime('2026-10-28T20:00:00Z', now, TZ)).toBe('Yesterday');
    expect(notificationTime('2026-10-25T20:00:00Z', now, TZ)).toBe('Sun');
    expect(notificationTime('2026-10-06T20:00:00Z', now, TZ)).toBe('Oct 6');
  });
  it('uses PM for afternoon times today', () => {
    const late = new Date('2026-10-30T01:00:00Z'); // 9 PM
    expect(notificationTime('2026-10-29T18:20:00Z', late, TZ)).toBe('2:20 PM');
  });
});

describe('read state', () => {
  it('finds the newest updated_at', () => {
    expect(newestUpdatedAt([])).toBeNull();
    expect(
      newestUpdatedAt([{ updated_at: '2026-10-29T10:00:00Z' }, { updated_at: '2026-10-29T12:00:00Z' }, { updated_at: '2026-10-28T12:00:00Z' }]),
    ).toBe('2026-10-29T12:00:00Z');
  });
  it('knows when anything is unread', () => {
    expect(hasUnread([{ read_at: 'x' }])).toBe(false);
    expect(hasUnread([{ read_at: 'x' }, { read_at: null }])).toBe(true);
  });
  it('keeps NEW on rows seen unread', () => {
    const first = seenUnread(new Set(), [{ id: 'a', read_at: null }, { id: 'b', read_at: 'x' }]);
    expect([...first]).toEqual(['a']);
    const second = seenUnread(first, [{ id: 'a', read_at: 'y' }, { id: 'c', read_at: null }]);
    expect([...second].sort()).toEqual(['a', 'c']);
  });
  it('labels the bell with its count', () => {
    expect(bellLabel(0)).toBe('Updates');
    expect(bellLabel(3)).toBe('Updates, 3 new');
  });
});

describe('quiet hours', () => {
  it('writes times as the design does', () => {
    expect(quietTime('23:00:00')).toBe('11 PM');
    expect(quietTime('07:00')).toBe('7 AM');
    expect(quietTime('06:30')).toBe('6:30 AM');
    expect(quietTime('00:00')).toBe('midnight');
    expect(quietTime('12:00')).toBe('noon');
    expect(quietTime(null)).toBe('midnight');
  });
  it('builds the Updates caption', () => {
    expect(quietCaption(null)).toBe('Quiet hours 11 PM to 7 AM. Lock-screen previews never show who or where.');
    expect(
      quietCaption({ quiet_hours_enabled: true, quiet_start: '22:00:00', quiet_end: '08:00:00', show_details: false }),
    ).toBe('Quiet hours 10 PM to 8 AM. Lock-screen previews never show who or where.');
    expect(quietCaption({ quiet_hours_enabled: false, quiet_start: null, quiet_end: null, show_details: true })).toBe(
      'Quiet hours are off. Lock-screen previews show what the update is about.',
    );
    expect(quietCaption({ quiet_hours_enabled: null, quiet_start: null, quiet_end: null, show_details: null })).toBe(
      'Quiet hours 11 PM to 7 AM. Lock-screen previews never show who or where.',
    );
  });
  it('offers the fixed chips plus a saved custom time', () => {
    expect(hhmm('23:00:00')).toBe('23:00');
    expect(hhmm(null)).toBe('');
    expect(quietOptions(QUIET_STARTS, '23:00:00')).toEqual([...QUIET_STARTS]);
    expect(quietOptions(QUIET_STARTS, '22:30:00')).toEqual(['00:00', '21:00', '22:00', '22:30', '23:00']);
    expect(quietOptions(QUIET_STARTS, null)).toEqual([...QUIET_STARTS]);
  });
});

describe('settings', () => {
  it('lists every type except the M6 placeholder, once', () => {
    const types = TYPE_SETTINGS.map((t) => t.type);
    expect(new Set(types).size).toBe(types.length);
    expect(types).not.toContain('challenge_response');
    expect(types).toHaveLength(15);
  });
  it('reads push_off', () => {
    expect(pushOn(null, 'mention')).toBe(true);
    expect(pushOn(['mention'], 'mention')).toBe(false);
    expect(pushOn(['live'], 'mention')).toBe(true);
  });
  it('names muted objects', () => {
    expect(muteKindLabel('plan')).toBe('Plan');
    expect(muteKindLabel('activity')).toBe('Game');
    expect(muteKindLabel('crew')).toBe('Crew');
    expect(muteKindLabel('challenge')).toBe('Challenge');
    expect(muteUntilLabel(null)).toBe('Muted until you unmute it');
    expect(muteUntilLabel('2026-10-31T14:00:00Z', TZ)).toBe('Muted until Sat 10:00');
  });
});

describe('needs you held for the visit', () => {
  it('remembers rows seen needing you', () => {
    const held = stickyNeedsYou(new Set(['x']), [row({ id: 'a' }), row({ id: 'b', needs_you: false })]);
    expect([...held].sort()).toEqual(['a', 'x']);
  });

  it('puts held rows back in Needs you until acted on', () => {
    const rows = [
      { ...row({ id: 't', section: 'today', needs_you: false }), acted_at: null },
      { ...row({ id: 'a', section: 'today', needs_you: false, read_at: 'r' }), acted_at: null },
      { ...row({ id: 'b', section: 'today', needs_you: false, read_at: 'r' }), acted_at: 'done' },
      { ...row({ id: 'e', section: 'earlier', needs_you: false }), acted_at: null },
    ];
    const out = withHeldNeedsYou(rows, new Set(['a', 'b']));
    expect(out.map((r) => [r.id, r.section, r.needs_you])).toEqual([
      ['a', 'needs_you', true],
      ['t', 'today', false],
      ['b', 'today', false],
      ['e', 'earlier', false],
    ]);
  });
});
